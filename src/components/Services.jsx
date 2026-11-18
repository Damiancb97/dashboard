import s from './Services.module.css'

function ServiceCard({ item, variant }) {
  const stopped = !!item.stopped
  const cls = [s.item, variant === 'priv' ? s.itemPriv : '', stopped ? s.itemStopped : ''].filter(Boolean).join(' ')
  const body = (
    <>
      {/* El favicon de la pestaña del propio servicio; si no tiene, el monograma. */}
      {item.icon
        ? <img className={s.icon} src={item.icon} alt="" />
        : <div className={s.mono} style={{ background: item.bg, color: item.fg }}>{item.mono}</div>}
      <div className={s.info}>
        <div className={s.name}>{item.name}</div>
        <div className={s.sub}>{item.sub}</div>
      </div>
      <div className={s.meta}>
        <span className={s.access}>{stopped ? 'Parado' : variant === 'priv' ? 'Privado' : 'Público'}</span>
        <div className={`${s.host} ${stopped ? s.hostStopped : ''}`}>{stopped ? 'PARADO' : item.tag}</div>
      </div>
    </>
  )

  // Los servicios parados no enlazan a ningún sitio: el puerto no responde.
  if (stopped) return <div className={cls} title={`${item.tag} · servicio parado`}>{body}</div>

  return (
    <a href={item.url} target="_blank" rel="noreferrer" className={cls}>
      {body}
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
        </div>
        <div className={s.note}>Expuestos · dominio .com / .es</div>
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
        <div className={s.note}>Red local o Tailscale · {lanIp}</div>
        <div className={s.items}>
          {privSvc.map(item => <ServiceCard key={item.url} item={item} variant="priv" />)}
        </div>
      </div>
    </div>
  )
}
