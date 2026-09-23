import { useState, useEffect, useRef } from 'react'

const BASE = '/glances/api/3'
const HIST_LEN = 48

async function get(path) {
  const r = await fetch(`${BASE}/${path}`)
  if (!r.ok) throw new Error(r.status)
  return r.json()
}

async function tryGet(path) {
  try {
    return await get(path)
  } catch {
    return null
  }
}

async function fetchGpu() {
  try {
    const r = await fetch('/gpu-stats/gpu')
    if (!r.ok) return null
    const data = await r.json()
    return Array.isArray(data) ? data[0] ?? null : null
  } catch {
    return null
  }
}

// Pick the host's primary network interface (most cumulative traffic),
// skipping loopback and virtual/bridge/container interfaces.
function pickInterface(network) {
  if (!Array.isArray(network)) return null
  const real = network.filter(
    i => !/^(lo|veth|br-|docker|virbr|vnet)/.test(i.interface_name)
  )
  if (!real.length) return null
  return real.reduce((a, b) =>
    (b.cumulative_rx ?? 0) > (a.cumulative_rx ?? 0) ? b : a
  )
}

function netRates(iface) {
  if (!iface) return { down: 0, up: 0, totalRx: 0, totalTx: 0, name: 'eth0' }
  const t = iface.time_since_update || 1
  const rxRate = iface.bytes_recv_rate_per_sec ?? (iface.rx ?? 0) / t
  const txRate = iface.bytes_sent_rate_per_sec ?? (iface.tx ?? 0) / t
  return {
    name: iface.interface_name,
    down: (rxRate * 8) / 1e6, // Mbps
    up: (txRate * 8) / 1e6,
    totalRx: iface.cumulative_rx ?? 0,
    totalTx: iface.cumulative_tx ?? 0,
  }
}

// Real host filesystems: dedupe by device, drop pseudo/virtual fs.
function cleanDisks(fs) {
  if (!Array.isArray(fs)) return []
  const skip = /^(tmpfs|overlay|squashfs|devtmpfs|efivarfs|aufs)$/
  const byDevice = new Map()
  for (const d of fs) {
    if (skip.test(d.fs_type)) continue
    if (!byDevice.has(d.device_name)) byDevice.set(d.device_name, d)
  }
  return [...byDevice.values()].map(d => {
    // Inside the container the host root surfaces under bind paths like
    // /etc/resolv.conf — present it as the root mount it really is.
    const looksBind = /^\/(etc|proc|sys|dev|run)\b/.test(d.mnt_point)
    const label = looksBind ? '/' : d.mnt_point
    return {
      label,
      sub: `${d.fs_type} · ${(d.size / 1073741824).toFixed(0)} GB`,
      used: d.used,
      size: d.size,
      percent: Math.round(d.percent),
    }
  })
}

// Top processes by CPU. The dashboard is public, so we deliberately avoid the
// full /processlist object (and the nginx proxy blocks it): command lines and
// usernames can leak secrets. The Glances API only returns one field per
// request, so we fetch the safe fields individually and zip them by index —
// the arrays come from the same snapshot, so they line up. A process churning
// between the parallel requests can only mislabel a row cosmetically; Math.min
// guards against index errors.
async function fetchProcs(limit = 6) {
  const [pid, name, cpu, mem] = await Promise.all([
    tryGet('processlist/pid'),
    tryGet('processlist/name'),
    tryGet('processlist/cpu_percent'),
    tryGet('processlist/memory_info'),
  ])
  // A partial snapshot would mislabel rows; report failure so the caller keeps
  // the previous list.
  if (!pid || !name || !cpu || !mem) return null
  const pids = pid.pid ?? []
  const names = name.name ?? []
  const cpus = cpu.cpu_percent ?? []
  const mems = mem.memory_info ?? []
  const n = Math.min(pids.length, names.length, cpus.length, mems.length)
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push({
      pid: pids[i],
      cmd: names[i],
      cpu: cpus[i] ?? 0,
      memMB: Array.isArray(mems[i]) ? Math.round(mems[i][0] / 1048576) : null,
    })
  }
  return rows.sort((a, b) => b.cpu - a.cpu).slice(0, limit)
}

const EMPTY_HIST = { serverCpu: [], gpu: [], netDown: [], netUp: [] }

// Glances 3.4 serves one request at a time, and a stats refresh blocks it for
// ~3s (mostly the containers plugin). Firing every endpoint every 3s queued
// requests behind that refresh until nginx timed them out, so each group is
// polled only as often as its data actually changes.
const FAST_MS = 3000 // cpu, mem, temperatures, network, GPU
const MEDIUM_MS = 10000 // containers, top processes
const SLOW_MS = 60000 // disks, uptime

export function useGlances() {
  const [data, setData] = useState({
    cpu: null, mem: null, containers: [], sensors: null, gpu: null,
    net: null, disks: [], procs: [], uptime: null, online: false,
    history: EMPTY_HIST,
  })
  const hist = useRef({ serverCpu: [], gpu: [], netDown: [], netUp: [] })

  useEffect(() => {
    function push(key, value) {
      const arr = hist.current[key]
      arr.push(value)
      if (arr.length > HIST_LEN) arr.shift()
    }

    // A failed request must not blank a panel: only fields that came back are
    // merged, so every panel keeps its last good value until the next success.
    const fresh = patch =>
      Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null))
    const merge = patch => setData(prev => ({ ...prev, ...fresh(patch) }))

    async function pollFast() {
      const [cpu, mem, sensors, gpu, network] = await Promise.all([
        tryGet('cpu'),
        tryGet('mem'),
        tryGet('sensors'),
        fetchGpu(),
        tryGet('network'),
      ])
      const net = network ? netRates(pickInterface(network)) : null

      if (cpu) push('serverCpu', cpu.total ?? 0)
      push('gpu', gpu?.proc ?? 0)
      if (net) {
        push('netDown', net.down)
        push('netUp', net.up)
      }

      setData(prev => ({
        ...prev,
        ...fresh({ cpu, mem, sensors, net }),
        // The GPU card shows OFFLINE when the sidecar is down, so its value is
        // replaced rather than kept.
        gpu,
        online: cpu != null,
        history: {
          serverCpu: [...hist.current.serverCpu],
          gpu: [...hist.current.gpu],
          netDown: [...hist.current.netDown],
          netUp: [...hist.current.netUp],
        },
      }))
    }

    async function pollMedium() {
      const [containers, procs] = await Promise.all([
        tryGet('containers'),
        fetchProcs(),
      ])
      merge({
        containers: containers == null ? null
          : Array.isArray(containers) ? containers : (containers.containers ?? []),
        procs,
      })
    }

    async function pollSlow() {
      const [fs, uptime] = await Promise.all([tryGet('fs'), tryGet('uptime')])
      merge({ disks: fs ? cleanDisks(fs) : null, uptime })
    }

    // Each group skips a tick while its previous poll is still in flight, so a
    // slow upstream cannot let requests stack up.
    function every(ms, poll) {
      let busy = false
      const run = async () => {
        if (busy) return
        busy = true
        try {
          await poll()
        } catch (e) {
          console.error('Glances error:', e)
        } finally {
          busy = false
        }
      }
      run()
      return setInterval(run, ms)
    }

    const ids = [
      every(FAST_MS, pollFast),
      every(MEDIUM_MS, pollMedium),
      every(SLOW_MS, pollSlow),
    ]
    return () => ids.forEach(clearInterval)
  }, [])

  return data
}
