import Sparkline from './Sparkline'
import { fmtBytes } from '../lib/format'
import s from './NetworkCard.module.css'

export default function NetworkCard({ net, history }) {
  const down = net ? net.down.toFixed(1) : '0.0'
  const up = net ? net.up.toFixed(1) : '0.0'
  const iface = net?.name || 'eth0'

  return (
    <div className={s.card}>
      <div className={s.head}>
        <div className={s.titleWrap}>
          <span className={s.tick} />
          <span className={s.title}>RED</span>
        </div>
        <span className={s.iface}>{iface}</span>
      </div>

      <div className={s.metrics}>
        <div>
          <div className={s.label}>▼ BAJADA</div>
          <div className={`${s.value} ${s.down}`}>{down}<span className={s.unit}> Mbps</span></div>
        </div>
        <div>
          <div className={s.label}>▲ SUBIDA</div>
          <div className={`${s.value} ${s.up}`}>{up}<span className={s.unit}> Mbps</span></div>
        </div>
      </div>

      <Sparkline
        a={history?.netDown} b={history?.netUp}
        colorA="#3fb37f" colorB="#4f9dff"
        style={{ width: '100%', height: '46px', display: 'block', marginTop: 'auto' }}
      />

      <div className={s.totals}>
        total ▼ {fmtBytes(net?.totalRx)} · ▲ {fmtBytes(net?.totalTx)}
      </div>
    </div>
  )
}
