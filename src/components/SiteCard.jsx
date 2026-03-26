import s from './SiteCard.module.css'

export default function SiteCard({ name, url, icon, description }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={s.card}>
      <img src={icon} alt={name} className={s.icon} />
      <div className={s.info}>
        <div className={s.name}>{name}</div>
        <div className={s.desc}>{description}</div>
      </div>
      <span className={s.arrow}>↗</span>
    </a>
  )
}
