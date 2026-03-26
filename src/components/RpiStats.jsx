import { useRpiGlances } from '../hooks/useRpiGlances'
import s from './ServerStats.module.css'
import r from './RpiStats.module.css'

function Bar({ value }) {
  const cls = value > 85 ? s.crit : value > 65 ? s.warn : s.ok
  return (
    <div className={s.track}>
      <div className={`${s.fill} ${cls}`} style={{ width: `${value}%` }} />
    </div>
  )
}

function TempBar({ value, crit = 80 }) {
  const pct = Math.min(100, Math.round((value / crit) * 100))
  const cls = value >= crit ? s.crit : value >= crit * 0.8 ? s.warn : s.ok
  return (
    <div className={s.track}>
      <div className={`${s.fill} ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function fmtGB(bytes) {
  return bytes ? (bytes / 1073741824).toFixed(1) + ' GB' : '—'
}

function getRpiTemp(sensors) {
  if (!Array.isArray(sensors)) return null
  return (
    sensors.find(s => s.label?.toLowerCase().includes('cpu_thermal')) ??
    sensors.find(s => s.label?.toLowerCase().includes('bcm2835')) ??
    sensors.find(s => s.type === 'temperature_core') ??
    null
  )
}

export default function RpiStats() {
  const { cpu, mem, sensors, online } = useRpiGlances()

  const cpuPct = Math.round(cpu?.total ?? 0)
  const memPct = Math.round(mem?.percent ?? 0)
  const temp = getRpiTemp(sensors)

  return (
    <div className={r.section}>
      <div className={r.header}>
        <span className={r.icon}>🍓</span>
        <span className={r.title}>Raspberry Pi</span>
        <span className={online ? r.online : r.offline}>{online ? 'online' : 'offline'}</span>
      </div>

      <div className={s.wrapper}>
        <div className={s.card}>
          <div className={s.label}>CPU</div>
          <div className={s.valueRow}>
            <div className={s.value}>{cpuPct}<span className={s.unit}>%</span></div>
            {temp && (
              <div className={s.temp}>{Math.round(temp.value)}<span className={s.unit}>°C</span></div>
            )}
          </div>
          <Bar value={cpuPct} />
          {temp && <TempBar value={temp.value} crit={temp.critical ?? 80} />}
          <div className={s.sub}>{cpu?.cpucore ?? '—'} cores · user {Math.round(cpu?.user ?? 0)}% · sys {Math.round(cpu?.system ?? 0)}%</div>
        </div>

        <div className={s.card}>
          <div className={s.label}>Memoria</div>
          <div className={s.value}>{memPct}<span className={s.unit}>%</span></div>
          <Bar value={memPct} />
          <div className={s.sub}>{fmtGB(mem?.used)} / {fmtGB(mem?.total)}</div>
        </div>
      </div>
    </div>
  )
}
