import s from './Services.module.css'

function ServiceCard({ item, variant }) {
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className={`${s.item} ${variant === 'priv' ? s.itemPriv : ''}`}>
      <div className={s.mono} style={{ background: item.bg, color: item.fg }}>{item.mono}</div>
      <div className={s.info}>
        <div className={s.name}>{item.name}</div>
        <div className={s.sub}>{item.sub}</div>
      </div>
      <div className={s.meta}>
        <span className={s.statusDot} style={{ background: variant === 'priv' ? '#54c98f' : '#3fb37f' }} />
        <div className={s.host}>{item.tag}</div>
      </div>
    </a>
  )
}

export default function Services({ publicSvc, privSvc, lanIp }) {
  return (
    <div className={s.grid}>
      <div className={s.card}>
        <div className={s.head}>
          <div className={s.titleWrap}>
            <span className={s.tick} style={{ background: 'var(--green)' }} />
            <span className={s.title}>PÚBLICOS</span>
          </div>
          <span className={s.note}>expuestos · dominio .com / .es</span>
        </div>
        <div className={s.items}>
          {publicSvc.map(item => <ServiceCard key={item.url} item={item} variant="pub" />)}
        </div>
      </div>

      <div className={s.card}>
        <div className={s.head}>
          <div className={s.titleWrap}>
            <span className={s.tick} style={{ background: 'var(--gold)' }} />
            <span className={s.title}>PRIVADOS</span>
            <span className={s.lanBadge}>LAN</span>
          </div>
        </div>
        <div className={s.privNote}>solo accesibles desde la red local · {lanIp}</div>
        <div className={s.items}>
          {privSvc.map(item => <ServiceCard key={item.url} item={item} variant="priv" />)}
        </div>
      </div>
    </div>
  )
}
