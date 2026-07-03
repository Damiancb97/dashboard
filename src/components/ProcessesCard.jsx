import { barColor } from '../lib/format'
import s from './ProcessesCard.module.css'

export default function ProcessesCard({ procs }) {
  const list = procs ?? []
  return (
    <div className={s.card}>
      <div className={s.head}>
        <div className={s.titleWrap}>
          <span className={s.tick} />
          <span className={s.title}>PROCESOS TOP</span>
        </div>
        <span className={s.note}>por uso de CPU</span>
      </div>

      <div className={s.headerRow}>
        <span>PID</span><span>COMANDO</span><span>CPU</span><span className={s.right}>MEM</span>
      </div>

      {list.length === 0 && <div className={s.empty}>Cargando…</div>}
      {list.map(p => {
        const color = barColor(Math.min(100, p.cpu * 3))
        return (
          <div key={p.pid} className={s.row}>
            <span className={s.pid}>{p.pid}</span>
            <div className={s.cmdWrap}>
              <div className={s.cmd}>{p.cmd}</div>
            </div>
            <div className={s.cpuCell}>
              <div className={s.track}>
                <div className={s.fill} style={{ width: `${Math.min(100, p.cpu * 3)}%`, background: color }} />
              </div>
              <span className={s.cpuTxt}>{p.cpu.toFixed(1)}%</span>
            </div>
            <span className={s.mem}>{p.memMB != null ? `${p.memMB} MB` : '—'}</span>
          </div>
        )
      })}
    </div>
  )
}
