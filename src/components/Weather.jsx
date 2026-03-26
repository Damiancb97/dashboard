import { useWeather } from '../hooks/useWeather'
import s from './Weather.module.css'

export default function Weather() {
  const w = useWeather()

  return (
    <div className={s.card}>
      <div className={s.label}>A Coruña</div>
      {w ? (
        <>
          <div className={s.main}>
            <span className={s.icon}>{w.icon}</span>
            <span className={s.temp}>{w.temp}<span className={s.unit}>°C</span></span>
          </div>
          <div className={s.wind}>💨 {w.wind} km/h</div>
        </>
      ) : (
        <div className={s.loading}>—</div>
      )}
    </div>
  )
}
