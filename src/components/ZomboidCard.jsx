import { useState } from 'react'
import { useZomboid } from '../hooks/useZomboid'
import s from './ZomboidCard.module.css'

// The sidecar reports the save's mtime as a Unix epoch rather than a formatted
// string: its container runs on UTC, so the hour is only correct once the browser
// renders it in the viewer's own timezone.
function formatSaveDate(epoch) {
  const saved = new Date(epoch * 1000)
  const time = saved.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (saved.toDateString() === today.toDateString()) return `hoy ${time}`
  if (saved.toDateString() === yesterday.toDateString()) return `ayer ${time}`

  const date = saved.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
  return `${date} ${time}`
}

function formatPlayerNames(names) {
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} más`
}

function formatSaveAge(seconds) {
  if (seconds < 60) return `hace ${seconds}s`
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    return `hace ${hours}h ${Math.floor((seconds % 3600) / 60)}m`
  }
  const days = Math.floor(seconds / 86400)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}

export default function ZomboidCard() {
  const {
    online,
    pid,
    cpu,
    memMB,
    cores,
    serverName,
    hasSave,
    hasDb,
    lastSave,
    players,
    logs,
    showLogs,
    setShowLogs,
    actionPending,
    errorMsg,
    startServer,
    stopServer,
    restartServer,
    resetWorld,
  } = useZomboid()

  const [confirmModal, setConfirmModal] = useState(null) // 'stop' | null

  // Wiping the world asks for a password instead of a plain confirmation: this
  // dashboard is public, so the sidecar validates it server-side and we only relay
  // its verdict here.
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState(null)

  const handleStopConfirm = () => {
    stopServer()
    setConfirmModal(null)
  }

  const closeReset = () => {
    setResetOpen(false)
    setResetPassword('')
    setResetError(null)
  }

  const handleResetSubmit = async e => {
    e.preventDefault()
    setResetError(null)
    const result = await resetWorld(resetPassword)
    if (result.ok) {
      closeReset()
    } else {
      // Password cleared but the panel stays open, so a typo means retyping the
      // password rather than starting the whole confirmation over.
      setResetPassword('')
      setResetError(result.message)
    }
  }

  return (
    <div className={s.card}>
      <div className={s.head}>
        <div className={s.titleWrap}>
          <span className={`${s.statusDot} ${online ? s.dotOnline : s.dotOffline}`} />
          <span className={s.title}>PROJECT ZOMBOID</span>
        </div>
        <span className={`${s.statusTag} ${online ? s.tagOnline : s.tagOffline}`}>
          {actionPending ? actionPending.toUpperCase() : online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      {errorMsg && <div className={s.errorBanner}>⚠️ {errorMsg}</div>}

      <div className={s.grid}>
        <div className={s.statItem}>
          <span className={s.label}>Servidor</span>
          <span className={s.val}>{serverName}</span>
        </div>
        <div className={s.statItem}>
          <span className={s.label}>Jugadores</span>
          <span className={`${s.val} ${online && players?.count > 0 ? s.valActive : ''}`}>
            {online && players ? `${players.count} / ${players.max}` : '—'}
          </span>
          <span className={s.subVal}>
            {!online
              ? 'servidor apagado'
              : !players
                ? 'sin datos'
                : players.count > 0
                  ? formatPlayerNames(players.names)
                  : 'nadie conectado'}
          </span>
        </div>
        <div className={s.statItem}>
          <span className={s.label}>Proceso PID</span>
          <span className={s.val}>{pid ?? '—'}</span>
        </div>
        <div className={s.statItem}>
          <span className={s.label}>Uso CPU</span>
          <span className={s.val}>{online ? `${cpu}%` : '0%'}</span>
          <span className={s.subVal}>
            {online ? `de 1 núcleo · ${(cpu / (cores || 1)).toFixed(1)}% del host` : `${cores || 1} núcleos`}
          </span>
        </div>
        <div className={s.statItem}>
          <span className={s.label}>Uso RAM</span>
          <span className={s.val}>{online ? `${memMB} MB` : '0 MB'}</span>
        </div>
        {/* Not gated on `online` — the save on disk is what matters most precisely
            when the server is off. */}
        <div className={s.statItem} title={lastSave ? `Detectado por ${lastSave.file}` : undefined}>
          <span className={s.label}>Último guardado</span>
          <span className={s.val}>{lastSave ? formatSaveDate(lastSave.epoch) : '—'}</span>
          <span className={s.subVal}>
            {lastSave ? formatSaveAge(lastSave.ageSec) : 'Sin guardado detectado'}
          </span>
        </div>
        <div className={s.statItem}>
          <span className={s.label}>Mundo / DB</span>
          <span className={s.subVal}>
            {hasSave ? '💾 Guardado' : '✨ Sin guardado'} · {hasDb ? '👤 DB OK' : '👤 DB limpia'}
          </span>
        </div>
      </div>

      <div className={s.actions}>
        <button
          className={`${s.btn} ${s.btnStart}`}
          onClick={startServer}
          disabled={online || !!actionPending}
        >
          ▶ Encender
        </button>

        <button
          className={`${s.btn} ${s.btnStop}`}
          onClick={() => setConfirmModal('stop')}
          disabled={!online || !!actionPending}
        >
          ■ Apagar
        </button>

        <button
          className={`${s.btn} ${s.btnRestart}`}
          onClick={restartServer}
          disabled={!!actionPending}
        >
          🔄 Reiniciar
        </button>

        <button
          className={`${s.btn} ${s.btnReset}`}
          onClick={() => (resetOpen ? closeReset() : setResetOpen(true))}
          disabled={!!actionPending}
        >
          ⚠️ Borrar Mundo
        </button>

        <button
          className={`${s.btn} ${s.btnConsole}`}
          onClick={() => setShowLogs(prev => !prev)}
        >
          💻 {showLogs ? 'Ocultar Consola' : 'Ver Consola'}
        </button>
      </div>

      {resetOpen && (
        <form className={s.resetPanel} onSubmit={handleResetSubmit}>
          <div className={s.resetTitle}>⚠️ Borrar Mundo</div>
          <div className={s.resetText}>
            Se eliminarán el mundo guardado y todas las cuentas. Se creará una copia de
            seguridad automática antes del borrado. Introduce la contraseña para confirmar.
          </div>
          <input
            className={s.resetInput}
            type="password"
            value={resetPassword}
            onChange={e => setResetPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete="current-password"
            autoFocus
            disabled={!!actionPending}
          />
          {resetError && <div className={s.resetError}>✗ {resetError}</div>}
          <div className={s.resetActions}>
            <button
              type="button"
              className={s.btn}
              onClick={closeReset}
              disabled={!!actionPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`${s.btn} ${s.btnStop}`}
              disabled={!resetPassword || !!actionPending}
            >
              {actionPending === 'reseteando' ? 'Borrando...' : 'Confirmar Borrado'}
            </button>
          </div>
        </form>
      )}

      {showLogs && (
        <pre className={s.logBox}>
          {logs || 'Cargando logs...'}
        </pre>
      )}

      {/* Modal de confirmación para Apagar */}
      {confirmModal === 'stop' && (
        <div className={s.modalOverlay}>
          <div className={s.modal}>
            <div className={s.modalTitle}>🛑 Confirmar Apagado</div>
            <div className={s.modalText}>
              ¿Estás seguro de que deseas apagar el servidor de Project Zomboid? Se guardará el progreso actual del mapa.
            </div>
            <div className={s.modalActions}>
              <button className={s.btn} onClick={() => setConfirmModal(null)}>Cancelar</button>
              <button className={`${s.btn} ${s.btnStop}`} onClick={handleStopConfirm}>Apagar Servidor</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
