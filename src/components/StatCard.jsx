import Sparkline from './Sparkline'
import s from './StatCard.module.css'

// Reusable metric card for Server / GPU / Raspberry Pi.
export default function StatCard({
  title, tickColor, online,
  metricLabel, metricValue, metricUnit = '%',
  spark, sparkColor,
  barLabel, barText, barPct, barColor,
  temp, tempColor: tempC,
  footer,
}) {
  return (
    <div className={s.card}>
      <div className={s.head}>
        <div className={s.titleWrap}>
          <span className={s.tick} style={{ background: tickColor }} />
          <span className={s.title}>{title}</span>
        </div>
        <span className={online ? s.online : s.offline}>{online ? 'ONLINE' : 'OFFLINE'}</span>
      </div>

      <div className={s.metricRow}>
        <div>
          <div className={s.metric}>{metricValue}<span className={s.unit}>{metricUnit}</span></div>
          <div className={s.metricLabel}>{metricLabel}</div>
        </div>
        <Sparkline data={spark} color={sparkColor} style={{ width: '118px', height: '42px', display: 'block' }} />
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

      <div className={s.footer}>{footer}</div>
    </div>
  )
}
