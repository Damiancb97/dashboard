import { barColor, fmtBytes } from '../lib/format'
import s from './StorageCard.module.css'

export default function StorageCard({ disks }) {
  const list = disks ?? []
  const totalUsed = list.reduce((a, d) => a + (d.used ?? 0), 0)
  const totalSize = list.reduce((a, d) => a + (d.size ?? 0), 0)

  return (
    <div className={s.card}>
      <div className={s.head}>
        <div className={s.titleWrap}>
          <span className={s.tick} />
          <span className={s.title}>ALMACENAMIENTO</span>
        </div>
        <span className={s.summary}>
          {totalSize ? `${fmtBytes(totalUsed)} / ${fmtBytes(totalSize)}` : '—'}
        </span>
      </div>

      <div className={s.list}>
        {list.length === 0 && <div className={s.empty}>Cargando…</div>}
        {list.map((d, i) => {
          const color = barColor(d.percent)
          return (
            <div key={`${d.label}-${i}`}>
              <div className={s.diskHead}>
                <div className={s.diskName}>
                  <span className={s.label}>{d.label}</span>
                  <span className={s.sub}>{d.sub}</span>
                </div>
                <div className={s.diskUsed}>
                  {fmtBytes(d.used)} / {fmtBytes(d.size)} · <span style={{ color }}>{d.percent}%</span>
                </div>
              </div>
              <div className={s.track}>
                <div className={s.fill} style={{ width: `${d.percent}%`, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
