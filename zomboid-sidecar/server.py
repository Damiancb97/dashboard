#!/usr/bin/env python3
import glob
import http.server
import json
import os
import re
import signal
import subprocess
import threading
import time
from urllib.parse import urlparse

PORT = 61212
ZOMBOID_DIR = "/home/serverubuntu/Zomboid"
SERVER_NAME = "ZomboidGZ"
CONSOLE_LOG = os.path.join(ZOMBOID_DIR, "server-console.txt")
SAVE_DIR = os.path.join(ZOMBOID_DIR, "Saves", "Multiplayer", SERVER_NAME)
LOGS_DIR = os.path.join(ZOMBOID_DIR, "Logs")
SERVER_INI = os.path.join(ZOMBOID_DIR, "Server", f"{SERVER_NAME}.ini")
STATE_FILE = os.path.join(ZOMBOID_DIR, ".sidecar-state.json")


def _env_int(name, default):
    try:
        return int(os.environ.get(name, ""))
    except ValueError:
        return default


# Idle shutdown. Overridable by environment so the whole cycle can be tested in two
# minutes instead of half an hour.
IDLE_ENABLED = os.environ.get("ZOMBOID_IDLE_ENABLED", "1") not in ("0", "false", "no")
IDLE_TIMEOUT_SEC = _env_int("ZOMBOID_IDLE_TIMEOUT_SEC", 1800)
KEEPALIVE_TIMEOUT_SEC = _env_int("ZOMBOID_KEEPALIVE_TIMEOUT_SEC", 3600)
# Booting takes ~50s. Without a grace period a server nobody has had time to join
# could shut itself down moments after being started.
IDLE_GRACE_SEC = _env_int("ZOMBOID_IDLE_GRACE_SEC", 180)
IDLE_CHECK_INTERVAL = 30.0

# Zomboid's own shutdown takes 9-12s on this world (measured: "Shutdown handling
# started" -> "finished"), so the stop timeout has to sit well clear of that or the
# SIGKILL fallback lands mid-shutdown.
STOP_TIMEOUT_SEC = 120.0

# connections.txt lines are flat key="value" pairs, e.g.
#   [10-08-26 09:18:52.168] event="fully-connected" message="" guid="10808..." username="manix" ...
_CONN_FIELD_RE = re.compile(r'([\w-]+)="([^"]*)"')
_MAX_PLAYERS_RE = re.compile(r"^MaxPlayers=(\d+)", re.MULTILINE)

CLK_TCK = os.sysconf("SC_CLK_TCK")
PAGE_SIZE = os.sysconf("SC_PAGE_SIZE")
CORES = os.cpu_count() or 1

# How often the background sampler recomputes CPU, and how strongly it favours the
# newest reading. Zomboid's CPU is spiky (a single instant can read 9% or 47%), so a
# light exponential average keeps the card readable without hiding real load.
SAMPLE_INTERVAL = 2.0
EMA_ALPHA = 0.4

# Files Zomboid rewrites when it persists world or player state. erosion.ini is
# deliberately absent: the erosion simulator rewrites it every ~30s whether or not
# anything was saved, so including it would make the world always look freshly saved.
# The map/ and chunkdata/ trees are also excluded — thousands of files, and they are
# continuous chunk streaming rather than a save point.
SAVE_MARKERS = (
    "map_t.bin",            # world clock, rewritten on world saves
    "id_manager_data.bin",  # object id block
    "players.db",           # player state
    "vehicles.db",
    "entity_data.bin",
    "global_mod_data.bin",
    "z_outfits.bin",
    "WorldDictionary.bin",
)


def find_zomboid_procs():
    """Locate the Zomboid wrapper shell and the JVM by scanning /proc.

    Both carry a -cachedir= argument and nothing else on this box does, so matching
    on it avoids the false positives a bare `pgrep -f ProjectZomboid` produces (it
    matches any shell whose command line merely mentions the name — which would then
    be counted as "online" and, worse, signalled by /stop).

    Returns (jvm_pid, wrapper_pid); either may be None.
    """
    jvm = None
    wrapper = None
    self_pid = os.getpid()

    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        pid = int(entry)
        if pid == self_pid:
            continue
        try:
            with open("/proc/%d/cmdline" % pid, "rb") as fh:
                argv = [a.decode("utf-8", "replace") for a in fh.read().split(b"\0") if a]
        except OSError:
            continue
        if not argv or not any(a.startswith("-cachedir=") for a in argv):
            continue
        if os.path.basename(argv[0]).startswith("ProjectZomboid"):
            jvm = pid
        elif any(a.endswith("start-server.sh") for a in argv):
            wrapper = pid

    return jvm, wrapper


def find_zomboid_pids():
    jvm, wrapper = find_zomboid_procs()
    # JVM first: SIGINT to the game process is what triggers its SaveAll & quit.
    return [p for p in (jvm, wrapper) if p]


def stop_zomboid_server(timeout=STOP_TIMEOUT_SEC):
    pids = find_zomboid_pids()
    if not pids:
        return False, "El servidor ya está apagado"

    # Send SIGINT (Signal 2) to trigger Project Zomboid's SaveAll & Quit sequence
    for pid in pids:
        try:
            os.kill(pid, signal.SIGINT)
        except Exception:
            subprocess.run(["kill", "-2", str(pid)], check=False)

    # Poll for process termination while save completes (up to timeout seconds)
    start_time = time.time()
    while time.time() - start_time < timeout:
        time.sleep(0.5)
        current_pids = find_zomboid_pids()
        if not current_pids:
            return True, "Partida guardada y servidor apagado correctamente"

    # Fallback cleanup if process hangs after save timeout
    remaining_pids = find_zomboid_pids()
    if remaining_pids:
        for pid in remaining_pids:
            try:
                os.kill(pid, signal.SIGKILL)
            except Exception:
                subprocess.run(["kill", "-9", str(pid)], check=False)

    return True, "Partida guardada y servidor finalizado"


def read_proc_cpu_ticks(pid):
    """Cumulative utime+stime in clock ticks for a pid.

    comm (field 2) can itself contain spaces and parentheses, so fields are taken
    from after the final ')'. That makes index 0 == field 3 (state), so utime
    (field 14) is index 11 and stime (field 15) is index 12.
    """
    with open("/proc/%d/stat" % pid) as fh:
        data = fh.read()
    fields = data[data.rindex(")") + 2:].split()
    return int(fields[11]) + int(fields[12])


def read_proc_rss_mb(pid):
    with open("/proc/%d/statm" % pid) as fh:
        resident_pages = int(fh.read().split()[1])
    return round(resident_pages * PAGE_SIZE / (1024.0 * 1024.0), 1)


def read_proc_start_epoch(pid):
    """Wall-clock time the process started, as a Unix epoch.

    starttime (field 22, so index 19 once comm is stripped) counts clock ticks since
    boot, which /proc/stat's btime turns into an absolute time.
    """
    with open("/proc/%d/stat" % pid) as fh:
        data = fh.read()
    starttime_ticks = int(data[data.rindex(")") + 2:].split()[19])

    with open("/proc/stat") as fh:
        for line in fh:
            if line.startswith("btime "):
                return int(line.split()[1]) + starttime_ticks / CLK_TCK
    raise ValueError("btime missing from /proc/stat")


def read_max_players(default=32):
    try:
        with open(SERVER_INI, errors="replace") as fh:
            found = _MAX_PLAYERS_RE.search(fh.read())
        return int(found.group(1)) if found else default
    except OSError:
        return default


def _is_closing(event, message):
    return "disconnect" in event or "disconnect" in message or message == "connection-lost"


def get_session_players(pid):
    """Who is in the world (and who is mid-join), from this session's connections log.

    Zomboid logs no running player total anywhere, so the sets are rebuilt from join
    and leave events. Tracking by guid rather than counting is what makes it correct:
    rejected logins (access-denied, ping-limit) emit a disconnect without ever having
    emitted a fully-connected, and discarding an absent guid is simply a no-op. A
    client that re-emits player-connect on the same guid overwrites instead of
    duplicating.

    `connecting` matters for the idle watchdog: joining is slow (observed
    "loading time was: 75111 ms", plus a login queue), and someone still loading is
    not yet fully-connected — shutting down under them would be the one thing the
    watchdog must never do.

    Only the current session counts. Archived logs live in Logs/logs_<date>/ subdirs,
    so the search is deliberately non-recursive, and a file predating the running
    process is ignored — that is the previous session's log, still newest for the
    second or two before this session creates its own.

    Returns {"names": [...], "connecting": int, "logMtime": float|None}.
    """
    empty = {"names": [], "connecting": 0, "logMtime": None}
    try:
        candidates = glob.glob(os.path.join(LOGS_DIR, "*connections.txt"))
        log = max(candidates, key=os.path.getmtime) if candidates else None
        if log is None:
            return empty
        log_mtime = os.path.getmtime(log)
        if log_mtime < read_proc_start_epoch(pid) - 10:
            return empty

        online = {}
        connecting = {}
        with open(log, errors="replace") as fh:
            for line in fh:
                fields = dict(_CONN_FIELD_RE.findall(line))
                guid = fields.get("guid")
                if not guid:
                    continue
                event = fields.get("event", "")
                message = fields.get("message", "")
                if event == "fully-connected":
                    online[guid] = fields.get("username") or "?"
                    connecting.pop(guid, None)
                elif _is_closing(event, message):
                    online.pop(guid, None)
                    connecting.pop(guid, None)
                elif guid not in online:
                    # Any other event for a guid that has not finished joining means a
                    # handshake in progress (login, queue, client-connect, ...).
                    connecting[guid] = fields.get("username") or "?"

        return {
            "names": sorted(online.values(), key=str.lower),
            "connecting": len(connecting),
            "logMtime": log_mtime,
        }
    except (OSError, ValueError):
        return empty


def _read_keepalive_until(session_start):
    """The idle timeout in force for this session.

    The override is stored against the session it was granted for, so it expires by
    construction: once the server stops and starts again the recorded sessionStart no
    longer matches and the timeout falls back to the default. That is exactly the
    requested behaviour — "mantener encendido" lasts one session only. An unreadable
    or malformed file also falls back to the default rather than keeping a server up
    forever.
    """
    try:
        with open(STATE_FILE) as fh:
            state = json.load(fh)
        if abs(float(state["sessionStart"]) - session_start) <= 2.0:
            return int(state["timeoutSec"])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return IDLE_TIMEOUT_SEC


def _write_keepalive(session_start, timeout_sec):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as fh:
        json.dump({"sessionStart": session_start, "timeoutSec": timeout_sec}, fh)
    os.replace(tmp, STATE_FILE)


def compute_idle(pid, players):
    """How long the server has been empty, derived from the filesystem — no timer state.

    connections.txt's mtime is the time of the last connection event, departures
    included (verified against archived logs), so "empty since" is simply that mtime,
    or the server's own start time when nobody has connected at all this session.
    Deriving it rather than counting in memory means a sidecar restart doesn't reset
    the clock and hand an empty server another full timeout.

    A guid stuck mid-handshake only defers the shutdown while the log is still being
    written: a port scan on a public server leaves a `new-incoming-connection` that
    never resolves and never closes, and must not block shutdown forever.
    """
    session_start = read_proc_start_epoch(pid)
    timeout_sec = _read_keepalive_until(session_start)
    now = time.time()
    log_mtime = players.get("logMtime")

    stale_handshake = log_mtime is None or (now - log_mtime) >= IDLE_GRACE_SEC
    occupied = bool(players["names"]) or (players["connecting"] > 0 and not stale_handshake)

    idle = {
        "timeoutSec": timeout_sec,
        "keepAlive": timeout_sec != IDLE_TIMEOUT_SEC,
        "enabled": IDLE_ENABLED,
        "sec": None,
        "shutdownAtEpoch": None,
    }
    if occupied:
        return idle, session_start

    idle_since = max(session_start, log_mtime or 0.0)
    idle["sec"] = max(0, int(now - idle_since))
    idle["shutdownAtEpoch"] = round(idle_since + timeout_sec, 3)
    return idle, session_start


_sample_lock = threading.Lock()
_sample = {"pid": None, "cpu": 0.0, "memMB": 0.0, "players": {"names": [], "connecting": 0}}


def _sampler_loop():
    """Continuously measure the JVM's real CPU usage.

    `ps -o %cpu` reports the process's lifetime average, which barely moves once the
    server has been up for hours, so CPU is derived from the delta in utime+stime
    between two samples instead. Sampling here rather than per-request also keeps the
    figure stable no matter how many dashboards are polling /status.
    """
    prev = None  # (pid, ticks, monotonic clock)

    while True:
        try:
            jvm, wrapper = find_zomboid_procs()
            pid = jvm or wrapper

            if pid is None:
                prev = None
                with _sample_lock:
                    _sample.update({
                        "pid": None,
                        "cpu": 0.0,
                        "memMB": 0.0,
                        "players": {"names": [], "connecting": 0},
                    })
            else:
                ticks = read_proc_cpu_ticks(pid)
                now = time.monotonic()
                mem_mb = read_proc_rss_mb(pid)
                players = get_session_players(pid)

                cpu = None
                if prev and prev[0] == pid:
                    elapsed = now - prev[2]
                    if elapsed >= 0.5:
                        cpu = max(0.0, (ticks - prev[1]) / CLK_TCK / elapsed * 100.0)
                prev = (pid, ticks, now)

                with _sample_lock:
                    if cpu is None:
                        # First sample for this pid: no delta to work from yet.
                        _sample.update({"pid": pid, "memMB": mem_mb, "players": players})
                    else:
                        previous = _sample["cpu"] if _sample["pid"] == pid else cpu
                        smoothed = EMA_ALPHA * cpu + (1.0 - EMA_ALPHA) * previous
                        _sample.update({
                            "pid": pid,
                            "cpu": round(smoothed, 1),
                            "memMB": mem_mb,
                            "players": players,
                        })
        except Exception:
            # A process that exits mid-read is expected; keep sampling.
            pass

        time.sleep(SAMPLE_INTERVAL)


def get_process_stats():
    with _sample_lock:
        return dict(_sample)


def _idle_watchdog_loop():
    """Stop an empty server once it has been idle past its timeout.

    Lives here rather than in the Discord bot on purpose: this process is always up and
    already owns the lifecycle, so the server still shuts down when Discord is
    unreachable or the bot is down — which is precisely when an idle server would
    otherwise be left burning ~9.5 GB and a core all night.
    """
    while True:
        time.sleep(IDLE_CHECK_INTERVAL)
        if not IDLE_ENABLED:
            continue
        try:
            jvm, wrapper = find_zomboid_procs()
            pid = jvm or wrapper
            if pid is None:
                continue

            players = get_session_players(pid)
            idle, session_start = compute_idle(pid, players)
            if idle["sec"] is None:
                continue
            # Booting is not idling: nobody can join a server that is still loading.
            if time.time() - session_start < IDLE_GRACE_SEC:
                continue
            if idle["sec"] < idle["timeoutSec"]:
                continue

            print(
                "Idle shutdown: %ds sin jugadores (limite %ds), apagando con guardado"
                % (idle["sec"], idle["timeoutSec"]),
                flush=True,
            )
            success, message = stop_zomboid_server()
            print("Idle shutdown: %s - %s" % (success, message), flush=True)
        except Exception as exc:
            print("Idle watchdog error: %s" % exc, flush=True)


def get_last_save():
    """Newest mtime among the save markers, or None if the world has never saved.

    Only the epoch is returned — this container runs on UTC, so rendering a local
    timestamp here would show the wrong hour. The browser formats it instead.
    """
    newest_mtime = None
    newest_file = None

    for name in SAVE_MARKERS:
        try:
            mtime = os.path.getmtime(os.path.join(SAVE_DIR, name))
        except OSError:
            continue
        if newest_mtime is None or mtime > newest_mtime:
            newest_mtime = mtime
            newest_file = name

    if newest_mtime is None:
        return None

    return {
        "epoch": round(newest_mtime, 3),
        "file": newest_file,
        "ageSec": max(0, int(time.time() - newest_mtime)),
    }


def check_save_exists():
    return os.path.isdir(SAVE_DIR)


def check_db_exists():
    db_path = os.path.join(ZOMBOID_DIR, "db", f"{SERVER_NAME}.db")
    return os.path.isfile(db_path)


def read_last_logs(lines_count=60):
    log_files = glob.glob(os.path.join(ZOMBOID_DIR, "Logs", "**", "*DebugLog-server.txt"), recursive=True)
    if os.path.isfile(CONSOLE_LOG) and os.path.getsize(CONSOLE_LOG) > 0:
        log_files.append(CONSOLE_LOG)

    if not log_files:
        return "Consola vacía. No se ha generado log aún."

    newest = max(log_files, key=os.path.getmtime)
    try:
        out = subprocess.check_output(
            ["tail", "-n", str(lines_count), newest],
            text=True,
            errors="replace"
        )
        header = f"--- [Mostrando últimas {lines_count} líneas de {os.path.basename(newest)}] ---\n"
        return header + out
    except Exception as e:
        return f"Error leyendo logs: {str(e)}"

class ZomboidHandler(http.server.BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path.rstrip('/')

        if path in ["/status", "/api/status", ""]:
            stats = get_process_stats()
            online = stats["pid"] is not None
            players = stats["players"]
            idle = None
            if online:
                try:
                    idle, _ = compute_idle(stats["pid"], players)
                except (OSError, ValueError):
                    idle = None
            self._send_json({
                "online": online,
                "pid": stats["pid"],
                "cpu": stats["cpu"] if online else 0.0,
                "memMB": stats["memMB"] if online else 0.0,
                "cores": CORES,
                "serverName": SERVER_NAME,
                "hasSave": check_save_exists(),
                "hasDb": check_db_exists(),
                "lastSave": get_last_save(),
                "players": {
                    "count": len(players["names"]),
                    "max": read_max_players(),
                    "names": players["names"],
                    "connecting": players["connecting"],
                },
                "idle": idle,
            })
        elif path in ["/logs", "/api/logs"]:
            self._send_json({"logs": read_last_logs()})
        else:
            self._send_json({"error": "Not Found"}, status=404)

    def do_POST(self):
        url = urlparse(self.path)
        path = url.path.rstrip('/')

        pids = find_zomboid_pids()

        if path in ["/start", "/api/start"]:
            if pids:
                self._send_json({"success": False, "message": "El servidor ya está encendido"}, status=400)
                return

            script_name = "start-zomboid.sh" if check_db_exists() else "first-start-zomboid.sh"
            script_path = os.path.join(ZOMBOID_DIR, script_name)

            try:
                log_file = open(CONSOLE_LOG, "w")
                subprocess.Popen(
                    ["bash", script_path],
                    cwd=ZOMBOID_DIR,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True
                )
                self._send_json({"success": True, "message": f"Iniciando servidor con {script_name}..."})
            except Exception as e:
                self._send_json({"success": False, "message": f"Error al arrancar: {str(e)}"}, status=500)

        elif path in ["/stop", "/api/stop"]:
            if not pids:
                self._send_json({"success": False, "message": "El servidor ya está apagado"}, status=400)
                return

            success, msg = stop_zomboid_server()
            if success:
                self._send_json({"success": True, "message": msg})
            else:
                self._send_json({"success": False, "message": msg}, status=500)

        elif path in ["/restart", "/api/restart"]:
            if pids:
                stop_zomboid_server()

            script_name = "start-zomboid.sh" if check_db_exists() else "first-start-zomboid.sh"
            script_path = os.path.join(ZOMBOID_DIR, script_name)
            try:
                log_file = open(CONSOLE_LOG, "w")
                subprocess.Popen(
                    ["bash", script_path],
                    cwd=ZOMBOID_DIR,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True
                )
                self._send_json({"success": True, "message": "Reiniciando servidor..."})
            except Exception as e:
                self._send_json({"success": False, "message": f"Error al reiniciar: {str(e)}"}, status=500)

        elif path in ["/keepalive", "/api/keepalive"]:
            jvm, wrapper = find_zomboid_procs()
            pid = jvm or wrapper
            if pid is None:
                self._send_json(
                    {"success": False, "message": "El servidor está apagado"}, status=400
                )
                return
            try:
                session_start = read_proc_start_epoch(pid)
                _write_keepalive(session_start, KEEPALIVE_TIMEOUT_SEC)
                players = get_session_players(pid)
                idle, _ = compute_idle(pid, players)
                minutes = KEEPALIVE_TIMEOUT_SEC // 60
                self._send_json({
                    "success": True,
                    "message": f"Auto-apagado ampliado a {minutes} min para esta sesión",
                    "idle": idle,
                })
            except Exception as e:
                self._send_json(
                    {"success": False, "message": f"Error al ampliar: {str(e)}"}, status=500
                )

        elif path in ["/reset", "/api/reset"]:
            if pids:
                stop_zomboid_server()

            reset_script = os.path.join(ZOMBOID_DIR, "reset-zomboid-world.sh")
            try:
                out = subprocess.check_output(["bash", reset_script], cwd=ZOMBOID_DIR, text=True)
                self._send_json({"success": True, "message": "Mundo reseteado correctamente.", "output": out})
            except Exception as e:
                self._send_json({"success": False, "message": f"Error en reseteo: {str(e)}"}, status=500)

        else:
            self._send_json({"error": "Endpoint no encontrado"}, status=404)

def run():
    threading.Thread(target=_sampler_loop, daemon=True).start()
    threading.Thread(target=_idle_watchdog_loop, daemon=True).start()
    # Threaded so a slow /stop or /reset can't stall the /status polls behind it.
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), ZomboidHandler)
    server.daemon_threads = True
    print(f"Zomboid Sidecar API corriendo en http://0.0.0.0:{PORT}")
    print(
        "Auto-apagado: %s (limite %ds, keepalive %ds, gracia %ds)"
        % (
            "activado" if IDLE_ENABLED else "desactivado",
            IDLE_TIMEOUT_SEC,
            KEEPALIVE_TIMEOUT_SEC,
            IDLE_GRACE_SEC,
        )
    )
    server.serve_forever()

if __name__ == "__main__":
    run()
