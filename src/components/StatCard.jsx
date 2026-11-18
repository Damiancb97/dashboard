import Sparkline from './Sparkline'
import s from './StatCard.module.css'

// Reusable metric card for Server / GPU / Raspberry Pi.
export default function StatCard({
  title, tickColor, online, featured = false,
  metricLabel, metricValue, metricUnit = '%',
  spark, sparkColor,
  barLabel, barText, barPct, barColor,
  temp, tempColor: tempC,
  footer,
}) {
  return (
    <div className={`${s.card} ${featured ? s.featured : ''}`}>
      <div className={s.head}>
        <div className={s.titleWrap}>
          <span className={s.tick} style={{ background: tickColor }} />
          <span className={s.title}>{title}</span>
        </div>
        <span className={online ? s.online : s.offline}>{online ? 'En línea' : 'Sin conexión'}</span>
      </div>

      <div className={s.metricRow}>
        <div>
          <div className={s.metric}>{metricValue ?? '—'}{metricValue != null && <span className={s.unit}>{metricUnit}</span>}</div>
          <div className={s.metricLabel}>{metricLabel}</div>
        </div>
        <div className={s.chart}><Sparkline data={spark} color={sparkColor} style={{ width: '100%', height: '76px', display: 'block' }} /></div>
      </div>

      <div className={s.bars}>
        <div>
          <div className={s.barHead}>
            <span className={s.barLabel}>{barLabel}</span>
            <span className={s.barText}>{barText}</span>
          </div>
          <div className={s.track}>
            <div className={s.fill} style={{ width: `${barPct}%`, background: barColor }} />
          </div>
        </div>
        <div className={s.tempRow}>
          <span className={s.barLabel}>TEMPERATURA</span>
          <span className={s.tempValue} style={{ color: tempC }}>
            {temp != null ? `${temp}°C` : '—'}
          </span>
        </div>
      </div>

      <div className={s.footer}>{!online && metricValue != null ? `Última lectura · ${footer}` : footer}</div>
    </div>
  )
}
