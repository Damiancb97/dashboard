#!/usr/bin/env python3
"""Discord front-end for the Project Zomboid sidecar.

The bot owns no server logic: lifecycle, player detection and the idle shutdown all
live in zomboid-sidecar, which is always up. This process only renders state and
forwards button presses, so losing it never leaves the game server stranded.
"""
import asyncio
import logging
import os
import time

import discord
import httpx
from discord.ext import tasks

LOGGER = logging.getLogger("zomboid-bot")

HEARTBEAT_FILE = "/tmp/zomboid-bot-heartbeat"

# Stopping blocks server-side while Zomboid runs SaveAll and shuts down (up to
# STOP_TIMEOUT_SEC in the sidecar), so action calls need a far longer budget than a
# status poll.
STATUS_TIMEOUT = 10.0
ACTION_TIMEOUT = 180.0


def _env_int(name, default=0):
    try:
        return int(os.environ.get(name, ""))
    except ValueError:
        return default


class Settings:
    def __init__(self):
        self.token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
        self.guild_id = _env_int("DISCORD_GUILD_ID")
        self.channel_id = _env_int("DISCORD_CHANNEL_ID")
        self.role_id = _env_int("DISCORD_ADMIN_ROLE_ID")
        self.sidecar_url = os.environ.get(
            "ZOMBOID_SIDECAR_URL", "http://127.0.0.1:61212"
        ).rstrip("/")
        self.poll_interval = _env_int("BOT_POLL_INTERVAL_SEC", 15)
        self.warn_before_sec = _env_int("BOT_WARN_BEFORE_SEC", 300)

    @property
    def enabled(self):
        """No-op instead of crashing when unconfigured (same idea as the sotrixOS bot)."""
        return bool(self.token and self.guild_id and self.channel_id and self.role_id)

    def missing(self):
        names = {
            "DISCORD_BOT_TOKEN": self.token,
            "DISCORD_GUILD_ID": self.guild_id,
            "DISCORD_CHANNEL_ID": self.channel_id,
            "DISCORD_ADMIN_ROLE_ID": self.role_id,
        }
        return [key for key, value in names.items() if not value]


class RedactTokenFilter(logging.Filter):
    """Keep the bot token out of the logs even when a library echoes a URL."""

    def __init__(self, token):
        super().__init__()
        self._token = token

    def filter(self, record):
        if self._token:
            if isinstance(record.msg, str) and self._token in record.msg:
                record.msg = record.msg.replace(self._token, "[REDACTED]")
            if record.args:
                record.args = tuple(
                    arg.replace(self._token, "[REDACTED]") if isinstance(arg, str) else arg
                    for arg in record.args
                )
        return True


class SidecarClient:
    def __init__(self, base_url):
        self._base_url = base_url
        self._client = httpx.AsyncClient(base_url=base_url)

    async def status(self):
        response = await self._client.get("/status", timeout=STATUS_TIMEOUT)
        response.raise_for_status()
        return response.json()

    async def action(self, name):
        """POST an action. Returns (ok, message); 400 carries a real reason, not a crash."""
        try:
            response = await self._client.post(f"/{name}", timeout=ACTION_TIMEOUT)
            payload = response.json()
            return bool(payload.get("success")), payload.get("message", "Sin mensaje")
        except httpx.HTTPError as exc:
            LOGGER.warning("sidecar action %s failed: %s", name, exc)
            return False, f"No se pudo contactar con el servidor: {exc}"

    async def close(self):
        await self._client.aclose()


def format_players(names):
    if not names:
        return "nadie conectado"
    return ", ".join(names)


def format_duration(seconds):
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60} min"
    return f"{seconds // 3600}h {(seconds % 3600) // 60}m"


def build_embed(status):
    """Render /status as the panel embed."""
    if status is None:
        return discord.Embed(
            title="🧟 Project Zomboid",
            description="⚠️ Sin contacto con el sidecar.",
            colour=discord.Colour.orange(),
        )

    online = status.get("online")
    players = status.get("players") or {}
    names = players.get("names") or []
    count = players.get("count", 0)

    if not online:
        embed = discord.Embed(
            title="🧟 Project Zomboid",
            description="⚫ **Apagado** — pulsa **Encender** para levantarlo.",
            colour=discord.Colour.dark_grey(),
        )
    else:
        embed = discord.Embed(
            title="🧟 Project Zomboid",
            description=f"🟢 **Encendido** — {count}/{players.get('max', '?')} jugadores",
            colour=discord.Colour.green() if count else discord.Colour.blue(),
        )
        embed.add_field(name="Jugadores", value=format_players(names), inline=False)

        connecting = players.get("connecting") or 0
        if connecting:
            embed.add_field(name="Entrando", value=f"{connecting} cargando…", inline=True)

        idle = status.get("idle") or {}
        if idle.get("enabled") and idle.get("sec") is not None:
            remaining = max(0, idle["timeoutSec"] - idle["sec"])
            suffix = " (ampliado)" if idle.get("keepAlive") else ""
            embed.add_field(
                name="Auto-apagado",
                value=f"en {format_duration(remaining)}{suffix}",
                inline=True,
            )

        embed.add_field(
            name="Recursos",
            value=f"{status.get('cpu', 0)}% CPU · {round(status.get('memMB', 0) / 1024, 1)} GB",
            inline=True,
        )

    last_save = status.get("lastSave")
    if last_save:
        embed.set_footer(
            text=f"Último guardado hace {format_duration(last_save.get('ageSec', 0))}"
        )
    return embed


class ConfirmStop(discord.ui.View):
    """Ephemeral confirmation shown only when players are still inside.

    Deliberately not a persistent view: it is short-lived and per-interaction, so the
    view instance can hold its own state and expire on its own.
    """

    def __init__(self):
        super().__init__(timeout=60)
        self.confirmed = False

    @discord.ui.button(label="Sí, apagar", style=discord.ButtonStyle.danger)
    async def confirm(self, interaction, button):
        del button
        self.confirmed = True
        self.stop()
        await interaction.response.edit_message(content="Apagando…", view=None)

    @discord.ui.button(label="Cancelar", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction, button):
        del button
        self.stop()
        await interaction.response.edit_message(content="Cancelado.", view=None)


class ControlPanel(discord.ui.View):
    """The persistent panel.

    timeout=None plus a fixed custom_id on every button is what lets the panel keep
    working after the bot restarts; without both, the buttons go dead and the message
    has to be reposted.
    """

    def __init__(self, bot):
        super().__init__(timeout=None)
        self.bot = bot

    async def interaction_check(self, interaction):
        """Role gate for every button, checked in one place."""
        if not self.bot.authorized(interaction):
            await interaction.response.send_message(
                "No tienes permiso para controlar el servidor.", ephemeral=True
            )
            return False
        return True

    @discord.ui.button(
        label="Encender", emoji="▶️",
        style=discord.ButtonStyle.success, custom_id="zomboid:start",
    )
    async def start(self, interaction, button):
        del button
        # Discord kills the interaction after 3s; booting takes ~50s.
        await interaction.response.defer(ephemeral=True, thinking=True)
        ok, message = await self.bot.sidecar.action("start")
        if not ok:
            await interaction.followup.send(f"❌ {message}", ephemeral=True)
            return
        await interaction.followup.send(
            "⏳ Encendiendo. El mundo tarda ~1 minuto en cargar; espera a que el panel "
            "diga **Encendido** antes de entrar.",
            ephemeral=True,
        )
        await self.bot.refresh_panel()

    @discord.ui.button(
        label="Apagar", emoji="⏹️",
        style=discord.ButtonStyle.danger, custom_id="zomboid:stop",
    )
    async def stop_server(self, interaction, button):
        del button
        status = await self.bot.safe_status()
        count = ((status or {}).get("players") or {}).get("count", 0)

        if count:
            names = format_players(((status or {}).get("players") or {}).get("names") or [])
            view = ConfirmStop()
            await interaction.response.send_message(
                f"⚠️ Hay **{count}** jugando ({names}). ¿Apagar de todas formas?",
                view=view, ephemeral=True,
            )
            await view.wait()
            if not view.confirmed:
                return
            ok, message = await self.bot.sidecar.action("stop")
            await interaction.followup.send(
                f"{'✅' if ok else '❌'} {message}", ephemeral=True
            )
        else:
            await interaction.response.defer(ephemeral=True, thinking=True)
            ok, message = await self.bot.sidecar.action("stop")
            await interaction.followup.send(
                f"{'✅' if ok else '❌'} {message}", ephemeral=True
            )
        await self.bot.refresh_panel()

    @discord.ui.button(
        label="Mantener encendido", emoji="☕",
        style=discord.ButtonStyle.primary, custom_id="zomboid:keepalive",
    )
    async def keepalive(self, interaction, button):
        del button
        await interaction.response.defer(ephemeral=True, thinking=True)
        ok, message = await self.bot.sidecar.action("keepalive")
        await interaction.followup.send(f"{'✅' if ok else '❌'} {message}", ephemeral=True)
        if ok:
            self.bot.warned = False
        await self.bot.refresh_panel()

    @discord.ui.button(
        label="Jugadores", emoji="👥",
        style=discord.ButtonStyle.secondary, custom_id="zomboid:players",
    )
    async def players(self, interaction, button):
        del button
        status = await self.bot.safe_status()
        if status is None:
            await interaction.response.send_message(
                "⚠️ Sin contacto con el servidor.", ephemeral=True
            )
            return
        if not status.get("online"):
            await interaction.response.send_message(
                "El servidor está apagado.", ephemeral=True
            )
            return
        players = status.get("players") or {}
        names = players.get("names") or []
        text = (
            f"**{players.get('count', 0)}/{players.get('max', '?')}** — {format_players(names)}"
        )
        connecting = players.get("connecting") or 0
        if connecting:
            text += f"\n_{connecting} entrando ahora mismo._"
        await interaction.response.send_message(text, ephemeral=True)

    @discord.ui.button(
        label="Estado", emoji="📊",
        style=discord.ButtonStyle.secondary, custom_id="zomboid:status",
    )
    async def status_button(self, interaction, button):
        del button
        status = await self.bot.safe_status()
        await interaction.response.send_message(embed=build_embed(status), ephemeral=True)


class ZomboidBot(discord.Client):
    def __init__(self, settings):
        # No privileged intents: buttons and embeds need none, which keeps the
        # Developer Portal setup to just inviting the bot.
        super().__init__(intents=discord.Intents.default())
        self.settings = settings
        self.sidecar = SidecarClient(settings.sidecar_url)
        self.panel_message = None
        self.previous_names = None
        self.warned = False
        # on_ready and the poll loop both reach ensure_panel right after login. Without
        # this, both get past the None check while awaiting channel.history and each
        # posts its own panel.
        self.panel_lock = asyncio.Lock()

    async def setup_hook(self):
        # Registering the view here is what revives the buttons of a panel posted by a
        # previous run of this process.
        self.add_view(ControlPanel(self))
        self.poll.start()

    def authorized(self, interaction):
        if interaction.guild_id != self.settings.guild_id:
            return False
        if interaction.channel_id != self.settings.channel_id:
            return False
        member = interaction.user
        if not isinstance(member, discord.Member):
            return False
        return any(role.id == self.settings.role_id for role in member.roles)

    async def safe_status(self):
        try:
            return await self.sidecar.status()
        except httpx.HTTPError as exc:
            LOGGER.warning("status poll failed: %s", exc)
            return None

    async def channel(self):
        channel = self.get_channel(self.settings.channel_id)
        if channel is None:
            channel = await self.fetch_channel(self.settings.channel_id)
        return channel

    async def ensure_panel(self):
        """Reuse the existing panel message instead of spamming a new one per restart."""
        async with self.panel_lock:
            if self.panel_message is not None:
                return self.panel_message
            channel = await self.channel()
            async for message in channel.history(limit=30):
                if message.author.id == self.user.id and message.components:
                    self.panel_message = message
                    LOGGER.info("Reusing existing panel message %s", message.id)
                    return message
            self.panel_message = await channel.send(
                embed=build_embed(await self.safe_status()), view=ControlPanel(self)
            )
            LOGGER.info("Posted new panel message %s", self.panel_message.id)
            return self.panel_message

    async def refresh_panel(self, status=None):
        try:
            message = await self.ensure_panel()
            if status is None:
                status = await self.safe_status()
            await message.edit(embed=build_embed(status), view=ControlPanel(self))
        except discord.HTTPException as exc:
            LOGGER.warning("panel refresh failed: %s", exc)
            self.panel_message = None

    async def announce(self, text):
        try:
            channel = await self.channel()
            await channel.send(text)
        except discord.HTTPException as exc:
            LOGGER.warning("announce failed: %s", exc)

    async def on_ready(self):
        LOGGER.info("Conectado como %s", self.user)
        await self.ensure_panel()

    @tasks.loop(seconds=15)
    async def poll(self):
        status = await self.safe_status()

        # Freshness heartbeat for the container healthcheck.
        try:
            with open(HEARTBEAT_FILE, "w") as handle:
                handle.write(str(int(time.time())))
        except OSError:
            pass

        if status is None:
            return

        online = status.get("online")
        players = status.get("players") or {}
        names = list(players.get("names") or [])

        if online:
            await self._announce_changes(names)
            await self._warn_before_shutdown(status, names)
        else:
            # A fresh session should start from a clean slate.
            self.previous_names = None
            self.warned = False

        await self.refresh_panel(status)

    async def _announce_changes(self, names):
        if self.previous_names is None:
            self.previous_names = names
            return
        joined = [n for n in names if n not in self.previous_names]
        left = [n for n in self.previous_names if n not in names]
        self.previous_names = names
        if joined:
            await self.announce(f"➡️ **{', '.join(joined)}** ha entrado al servidor.")
        if left:
            await self.announce(f"⬅️ **{', '.join(left)}** ha salido del servidor.")

    async def _warn_before_shutdown(self, status, names):
        idle = status.get("idle") or {}
        if names or not idle.get("enabled") or idle.get("sec") is None:
            self.warned = False
            return
        remaining = idle["timeoutSec"] - idle["sec"]
        if remaining <= self.settings.warn_before_sec and not self.warned:
            self.warned = True
            await self.announce(
                f"🕒 Nadie en el servidor: se apagará solo en "
                f"**{format_duration(remaining)}** (con guardado). "
                f"Pulsa **☕ Mantener encendido** para alargarlo."
            )

    @poll.before_loop
    async def before_poll(self):
        await self.wait_until_ready()

    async def close(self):
        await self.sidecar.close()
        await super().close()


def main():
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    settings = Settings()
    if settings.token:
        redaction = RedactTokenFilter(settings.token)
        for handler in logging.getLogger().handlers:
            handler.addFilter(redaction)

    if not settings.enabled:
        LOGGER.error(
            "Bot desactivado: faltan variables de entorno (%s). "
            "Copia .env.example a .env y rellénalas.",
            ", ".join(settings.missing()),
        )
        return

    bot = ZomboidBot(settings)
    bot.poll.change_interval(seconds=settings.poll_interval)
    bot.run(settings.token, log_handler=None)


if __name__ == "__main__":
    main()
