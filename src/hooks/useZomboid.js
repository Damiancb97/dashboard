import { useState, useEffect, useCallback, useRef } from 'react'

const BASE = '/zomboid/api'

const DEFAULTS = {
  online: false,
  pid: null,
  cpu: 0,
  memMB: 0,
  cores: 1,
  serverName: 'ZomboidGZ',
  hasSave: false,
  hasDb: false,
  lastSave: null,
  // null, not a zeroed object: a sidecar too old to report players must read as
  // "unknown" rather than claiming nobody is connected.
  players: null,
}

export function useZomboid() {
  const [data, setData] = useState(DEFAULTS)
  const [logs, setLogs] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  const [actionPending, setActionPending] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const busy = useRef(false)

  const pollStatus = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const res = await fetch(`${BASE}/status`)
      if (res.ok) {
        const json = await res.json()
        // Layered over the defaults so a sidecar that predates a field (mid-deploy)
        // leaves it at its default instead of making it undefined.
        setData({ ...DEFAULTS, ...json })
        setErrorMsg(null)
      } else {
        setData(prev => ({ ...prev, online: false }))
      }
    } catch {
      setData(prev => ({ ...prev, online: false }))
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    pollStatus()
    const interval = setInterval(pollStatus, 3000)
    return () => clearInterval(interval)
  }, [pollStatus])

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/logs`)
      if (res.ok) {
        const json = await res.json()
        setLogs(json.logs ?? '')
      }
    } catch {
      setLogs('Error al conectar con la consola del servidor.')
    }
  }, [])

  useEffect(() => {
    if (showLogs) {
      fetchLogs()
      const interval = setInterval(fetchLogs, 4000)
      return () => clearInterval(interval)
    }
  }, [showLogs, fetchLogs])

  const triggerAction = async (endpoint, actionName) => {
    setActionPending(actionName)
    setErrorMsg(null)
    try {
      const res = await fetch(`${BASE}/${endpoint}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErrorMsg(json.message || 'Error al ejecutar la acción')
      } else {
        await pollStatus()
      }
    } catch (e) {
      setErrorMsg(`Falló la conexión con el servidor: ${e.message}`)
    } finally {
      setActionPending(null)
    }
  }

  return {
    ...data,
    logs,
    showLogs,
    setShowLogs,
    actionPending,
    errorMsg,
    startServer: () => triggerAction('start', 'iniciando'),
    stopServer: () => triggerAction('stop', 'apagando'),
    restartServer: () => triggerAction('restart', 'reiniciando'),
    resetWorld: () => triggerAction('reset', 'reseteando'),
    fetchLogs,
  }
}
