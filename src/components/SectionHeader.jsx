import s from './SectionHeader.module.css'

export default function SectionHeader({ title, color }) {
  return (
    <div className={s.row}>
      <span className={s.tick} style={{ background: color || 'var(--accent)' }} />
      <span className={s.title}>{title}</span>
      <span className={s.rule} />
    </div>
  )
}
