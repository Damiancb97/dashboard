import { useState, useEffect } from 'react'
import s from './Header.module.css'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function Header({ online }) {
  const now = useClock()
  const hm = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const ss = String(now.getSeconds()).padStart(2, '0')
  const date = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <header className={s.bar}>
      <div className={s.brand}>
        <div className={s.logo}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="4" width="18" height="6" rx="1.5" />
            <rect x="3" y="14" width="18" height="6" rx="1.5" />
            <circle cx="7" cy="7" r="0.9" fill="currentColor" />
            <circle cx="7" cy="17" r="0.9" fill="currentColor" />
          </svg>
        </div>
        <div className={s.brandText}>
          <div className={s.name}>DAMIANCB</div>
          <div className={s.sub}>panel del servidor · acceso LAN</div>
        </div>
      </div>

      <div className={s.right}>
        <div className={`${s.pill} ${online ? s.live : s.down}`}>
          <span className={s.dot} />
          {online ? 'EN VIVO' : 'SIN CONEXIÓN'}
        </div>
        <div className={s.pillMono}>LAN 192.168.1.0/24</div>
        <div className={s.clock}>
          <div className={s.time}>{hm}<span className={s.secs}>:{ss}</span></div>
          <div className={s.date}>{date} · A Coruña</div>
        </div>
      </div>
    </header>
  )
}
