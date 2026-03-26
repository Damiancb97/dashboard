import { useGlances } from '../hooks/useGlances'
import s from './Containers.module.css'

function fmtMB(bytes) {
  if (!bytes) return '—'
  return bytes > 1073741824
    ? (bytes / 1073741824).toFixed(1) + ' GB'
    : (bytes / 1048576).toFixed(0) + ' MB'
}

function statusClass(status) {
  const st = (status ?? '').toLowerCase()
  if (st.includes('up') || st === 'running') return s.running
  if (st.includes('paus')) return s.paused
  return s.stopped
}

export default function Containers() {
  const { containers } = useGlances()

  return (
    <div className={s.card}>
      <div className={s.label}>Contenedores Docker <span className={s.count}>{containers.length}</span></div>
      <div className={s.tableWrapper}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Estado</th>
            <th>CPU</th>
            <th>RAM</th>
          </tr>
        </thead>
        <tbody>
          {containers.length === 0 && (
            <tr><td colSpan={4} className={s.empty}>Cargando...</td></tr>
          )}
          {containers.map(c => (
            <tr key={c.name}>
              <td>
                <span className={`${s.dot} ${statusClass(c.status)}`} />
                {c.name}
              </td>
              <td className={s.status}>{c.status ?? '—'}</td>
              <td>{typeof c.cpu_percent === 'number' ? c.cpu_percent.toFixed(1) + '%' : '—'}</td>
              <td>{fmtMB(c.memory_usage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
