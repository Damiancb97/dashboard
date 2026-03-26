import { useGlances } from '../hooks/useGlances'
import s from './GpuStats.module.css'

function Bar({ value }) {
  const cls = value > 85 ? s.crit : value > 65 ? s.warn : s.ok
  return (
    <div className={s.track}>
      <div className={`${s.fill} ${cls}`} style={{ width: `${value}%` }} />
    </div>
  )
}

function fmtMB(mb) {
  return mb != null ? (mb / 1024).toFixed(1) + ' GB' : '—'
}

export default function GpuStats() {
  const { gpu } = useGlances()

  if (!gpu) return null

  const gpuPct = Math.round(gpu.proc ?? 0)
  const memPct = Math.round(gpu.mem ?? 0)
  const temp = gpu.temperature != null ? Math.round(gpu.temperature) : null
  const memUsed = gpu.memory_used != null ? fmtMB(gpu.memory_used) : null
  const memTotal = gpu.memory_total != null ? fmtMB(gpu.memory_total) : null

  return (
    <div className={s.wrapper}>
      <div className={s.card}>
        <div className={s.labelRow}>
          <div className={s.label}>GPU</div>
          {gpu.name && <div className={s.name}>{gpu.name}</div>}
        </div>

        <div className={s.grid}>
          <div className={s.metric}>
            <div className={s.metricLabel}>Carga</div>
            <div className={s.value}>{gpuPct}<span className={s.unit}>%</span></div>
            <Bar value={gpuPct} />
          </div>

          <div className={s.metric}>
            <div className={s.metricLabel}>VRAM</div>
            <div className={s.value}>{memPct}<span className={s.unit}>%</span></div>
            <Bar value={memPct} />
            {memUsed && memTotal && (
              <div className={s.sub}>{memUsed} / {memTotal}</div>
            )}
          </div>

          {temp != null && (
            <div className={s.metric}>
              <div className={s.metricLabel}>Temp</div>
              <div className={`${s.value} ${temp >= 85 ? s.hot : temp >= 70 ? s.warm : ''}`}>
                {temp}<span className={s.unit}>°C</span>
              </div>
              <Bar value={Math.min(100, Math.round((temp / 95) * 100))} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
