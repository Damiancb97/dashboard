import { useState, useEffect, useRef } from 'react'

const BASE = '/rpi-glances/api/4'
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

export function useRpiGlances() {
  const [data, setData] = useState({
    cpu: null, mem: null, sensors: null, uptime: null, online: false,
    history: { rpiCpu: [] },
  })
  const hist = useRef({ rpiCpu: [] })

  useEffect(() => {
    async function poll() {
      try {
        const [cpu, mem, sensors, uptime] = await Promise.all([
          get('cpu'),
          get('mem'),
          tryGet('sensors'),
          tryGet('uptime'),
        ])
        const arr = hist.current.rpiCpu
        arr.push(cpu?.total ?? 0)
        if (arr.length > HIST_LEN) arr.shift()

        setData({
          cpu, mem, sensors, uptime, online: true,
          history: { rpiCpu: [...arr] },
        })
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
