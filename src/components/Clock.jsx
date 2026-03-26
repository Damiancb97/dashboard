import { useState, useEffect } from 'react'
import s from './Clock.module.css'

export default function Clock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = String(time.getHours()).padStart(2, '0')
  const mm = String(time.getMinutes()).padStart(2, '0')
  const ss = String(time.getSeconds()).padStart(2, '0')
  const date = time.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className={s.card}>
      <div className={s.time}>{hh}<span className={s.blink}>:</span>{mm}<span className={s.colon}>:{ss}</span></div>
      <div className={s.date}>{date}</div>
    </div>
  )
}
