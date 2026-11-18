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

// Containers come from the docker-stats sidecar, not Glances: Glances' plugin
// kept a `docker stats` stream open per container and dockerd paid for it 24/7.
// The rows keep Glances' field names (name, Status, cpu_percent, memory_usage).
async function fetchContainers() {
  try {
    const r = await fetch('/docker-stats/containers')
    if (!r.ok) return null
    const data = await r.json()
    return Array.isArray(data) ? data : null
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

const EMPTY_HIST = { serverCpu: [], gpu: [] }

// Glances 3.4 serves one request at a time. When its containers plugin made
// each stats refresh block it for ~3s, firing every endpoint every 3s queued
// requests until nginx timed them out, so each group is polled only as often
// as its data actually changes.
const FAST_MS = 3000 // cpu, mem, temperatures, GPU
const MEDIUM_MS = 10000 // containers
const SLOW_MS = 60000 // disks, uptime

export function useGlances() {
  const [data, setData] = useState({
    cpu: null, mem: null, containers: [], sensors: null, gpu: null,
    disks: [], uptime: null, online: false,
    history: EMPTY_HIST,
  })
  const hist = useRef({ serverCpu: [], gpu: [] })

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
      const [cpu, mem, sensors, gpu] = await Promise.all([
        tryGet('cpu'),
        tryGet('mem'),
        tryGet('sensors'),
        fetchGpu(),
      ])

      if (cpu) push('serverCpu', cpu.total ?? 0)
      push('gpu', gpu?.proc ?? 0)

      setData(prev => ({
        ...prev,
        ...fresh({ cpu, mem, sensors }),
        // The GPU card shows OFFLINE when the sidecar is down, so its value is
        // replaced rather than kept.
        gpu,
        online: cpu != null,
        history: {
          serverCpu: [...hist.current.serverCpu],
          gpu: [...hist.current.gpu],
        },
      }))
    }

    async function pollMedium() {
      const containers = await fetchContainers()
      merge({ containers })
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
        if (document.hidden || busy) return
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
      const id = setInterval(run, ms)
      document.addEventListener('visibilitychange', run)
      return () => {
        clearInterval(id)
        document.removeEventListener('visibilitychange', run)
      }
    }

    const ids = [
      every(FAST_MS, pollFast),
      every(MEDIUM_MS, pollMedium),
      every(SLOW_MS, pollSlow),
    ]
    return () => ids.forEach(stop => stop())
  }, [])

  return data
}
