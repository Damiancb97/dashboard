import { useGlances } from '../hooks/useGlances'
import s from './ServerStats.module.css'

function Bar({ value }) {
  const cls = value > 85 ? s.crit : value > 65 ? s.warn : s.ok
  return (
    <div className={s.track}>
      <div className={`${s.fill} ${cls}`} style={{ width: `${value}%` }} />
    </div>
  )
}

function TempBar({ value, high = 86, crit = 96 }) {
  const pct = Math.min(100, Math.round((value / crit) * 100))
  const cls = value >= crit ? s.crit : value >= high ? s.warn : s.ok
  return (
    <div className={s.track}>
      <div className={`${s.fill} ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function fmtGB(bytes) {
  return bytes ? (bytes / 1073741824).toFixed(1) + ' GB' : '—'
}

function getCpuTemp(sensors) {
  if (!Array.isArray(sensors)) return null
  const pkg = sensors.find(s => s.label === 'Package id 0' && s.type === 'temperature_core')
  if (pkg) return pkg
  return sensors.find(s => s.type === 'temperature_core') ?? null
}

export default function ServerStats() {
  const { cpu, mem, sensors } = useGlances()

  const cpuPct = Math.round(cpu?.total ?? 0)
  const memPct = Math.round(mem?.percent ?? 0)
  const cpuTemp = getCpuTemp(sensors)

  return (
    <div className={s.section}>
    <div className={s.sectionHeader}>
      <span className={s.sectionIcon}>🖥️</span>
      <span className={s.sectionTitle}>Server</span>
    </div>
    <div className={s.wrapper}>
      <div className={s.card}>
        <div className={s.label}>CPU</div>
        <div className={s.valueRow}>
          <div className={s.value}>{cpuPct}<span className={s.unit}>%</span></div>
          {cpuTemp && (
            <div className={s.temp}>{Math.round(cpuTemp.value)}<span className={s.unit}>°C</span></div>
          )}
        </div>
        <Bar value={cpuPct} />
        {cpuTemp && <TempBar value={cpuTemp.value} high={cpuTemp.warning ?? 86} crit={cpuTemp.critical ?? 96} />}
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
