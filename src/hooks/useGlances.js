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

// Top processes by CPU, trimmed to the fields the panel needs.
function topProcs(processlist, limit = 6) {
  if (!Array.isArray(processlist)) return []
  return [...processlist]
    .sort((a, b) => (b.cpu_percent ?? 0) - (a.cpu_percent ?? 0))
    .slice(0, limit)
    .map(p => ({
      pid: p.pid,
      cmd: Array.isArray(p.cmdline) && p.cmdline.length
        ? p.cmdline.join(' ')
        : p.name,
      user: p.username ?? '—',
      cpu: p.cpu_percent ?? 0,
      memMB: Array.isArray(p.memory_info) ? Math.round(p.memory_info[0] / 1048576) : null,
    }))
}

const EMPTY_HIST = { serverCpu: [], gpu: [], netDown: [], netUp: [] }

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

    async function poll() {
      try {
        const [cpu, mem, containers, sensors, gpu, network, fs, processlist, uptime] =
          await Promise.all([
            get('cpu'),
            get('mem'),
            get('containers'),
            tryGet('sensors'),
            fetchGpu(),
            tryGet('network'),
            tryGet('fs'),
            tryGet('processlist'),
            tryGet('uptime'),
          ])

        const net = netRates(pickInterface(network))

        push('serverCpu', cpu?.total ?? 0)
        push('gpu', gpu?.proc ?? 0)
        push('netDown', net.down)
        push('netUp', net.up)

        setData({
          cpu,
          mem,
          containers: Array.isArray(containers) ? containers : (containers.containers ?? []),
          sensors,
          gpu,
          net,
          disks: cleanDisks(fs),
          procs: topProcs(processlist),
          uptime,
          online: true,
          history: {
            serverCpu: [...hist.current.serverCpu],
            gpu: [...hist.current.gpu],
            netDown: [...hist.current.netDown],
            netUp: [...hist.current.netUp],
          },
        })
      } catch (e) {
        console.error('Glances error:', e)
        setData(prev => ({ ...prev, online: false }))
      }
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  return data
}
