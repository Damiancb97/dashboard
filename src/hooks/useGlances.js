import { useState, useEffect } from 'react'

const BASE = '/glances/api/3'

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

export function useGlances() {
  const [data, setData] = useState({ cpu: null, mem: null, containers: [], sensors: null, gpu: null })

  useEffect(() => {
    async function fetch() {
      try {
        const [cpu, mem, containers, sensors, gpu] = await Promise.all([
          get('cpu'),
          get('mem'),
          get('containers'),
          tryGet('sensors'),
          fetchGpu(),
        ])
        setData({
          cpu,
          mem,
          containers: Array.isArray(containers) ? containers : (containers.containers ?? []),
          sensors,
          gpu,
        })
      } catch (e) {
        console.error('Glances error:', e)
      }
    }
    fetch()
    const id = setInterval(fetch, 3000)
    return () => clearInterval(id)
  }, [])

  return data
}
