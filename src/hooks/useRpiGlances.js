import { useState, useEffect } from 'react'

const BASE = '/rpi-glances/api/4'

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

export function useRpiGlances() {
  const [data, setData] = useState({ cpu: null, mem: null, sensors: null, online: false })

  useEffect(() => {
    async function poll() {
      try {
        const [cpu, mem, sensors] = await Promise.all([
          get('cpu'),
          get('mem'),
          tryGet('sensors'),
        ])
        setData({ cpu, mem, sensors, online: true })
      } catch {
        setData(prev => ({ ...prev, online: false }))
      }
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  return data
}
