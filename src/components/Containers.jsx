import { useState } from 'react'
import { barColor, fmtMB } from '../lib/format'
import s from './Containers.module.css'

function isRunning(c) {
  const st = (c.Status ?? c.status ?? '').toLowerCase()
  return st.includes('up') || st === 'running'
}

const FILTERS = [
  { key: 'all', label: 'todos' },
  { key: 'running', label: 'activos' },
  { key: 'exited', label: 'detenidos' },
]

const COLS = [
  { key: 'name', label: 'NOMBRE' },
  { key: 'cpu_percent', label: 'CPU' },
  { key: 'memory_usage', label: 'RAM', right: true },
]

// Dirección natural al estrenar columna: nombre alfabético, métricas de más a menos.
const DEFAULT_DIR = { name: 'asc', cpu_percent: 'desc', memory_usage: 'desc' }

function compare(a, b, { key, dir }) {
  if (key === 'name') {
    const r = a.name.localeCompare(b.name)
    return dir === 'asc' ? r : -r
  }
  // Los detenidos no reportan métricas: al fondo siempre, suba o baje el orden.
  const va = typeof a[key] === 'number' ? a[key] : null
  const vb = typeof b[key] === 'number' ? b[key] : null
  if (va === null || vb === null) {
    if (va === vb) return a.name.localeCompare(b.name)
    return va === null ? 1 : -1
  }
  // Desempate estable por nombre: muchos comparten 0.0% y saltarían en cada poll.
  if (va === vb) return a.name.localeCompare(b.name)
  return dir === 'asc' ? va - vb : vb - va
}

export default function Containers({ containers }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })

  const toggleSort = key => setSort(prev =>
    prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: DEFAULT_DIR[key] }
  )

  const all = containers ?? []
  const running = all.filter(isRunning).length
  const ramSum = all.reduce((a, c) => a + (c.memory_usage ?? 0), 0)

  const list = all
    .filter(c => filter === 'all' || (filter === 'running' ? isRunning(c) : !isRunning(c)))
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => compare(a, b, sort))

  const sortHead = col => (
    <button
      onClick={() => toggleSort(col.key)}
      className={`${s.sortBtn} ${col.right ? s.right : ''} ${sort.key === col.key ? s.sortActive : ''}`}
      aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={`Ordenar por ${col.label.toLowerCase()}`}
    >
      {col.label}
      <span className={s.arrow}>{sort.key === col.key && sort.dir === 'asc' ? '▲' : '▼'}</span>
    </button>
  )

  return (
    <div className={s.card}>
      <div className={s.bar}>
        <div className={s.counts}>
          <span className={s.total}>{all.length}</span>
          <span className={s.dim}>contenedores</span>
          <span className={s.divider} />
          <span className={s.summary}>
            <span className={s.run}>{running}</span> activos · <span className={s.exit}>{all.length - running}</span> detenidos · <span className={s.ram}>{(ramSum / 1073741824).toFixed(1)} GB</span> RAM
          </span>
        </div>
        <div className={s.controls}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="buscar contenedor…"
            className={s.search}
          />
          <div className={s.filters}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`${s.filterBtn} ${filter === f.key ? s.active : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={s.scroll}>
        <div className={s.inner}>
          <div className={s.headerRow}>
            {sortHead(COLS[0])}<span>ESTADO</span>{sortHead(COLS[1])}{sortHead(COLS[2])}
          </div>
          {list.length === 0 && <div className={s.empty}>Sin resultados</div>}
          {list.map(c => {
            const run = isRunning(c)
            const cpu = typeof c.cpu_percent === 'number' ? c.cpu_percent : 0
            const cpuW = cpu <= 0 ? 0 : Math.max(3, Math.min(100, cpu * 3))
            return (
              <div key={c.Id ?? c.name} className={s.row}>
                <div className={s.nameCell}>
                  <span className={`${s.dot} ${run ? s.dotRun : s.dotStop}`} />
                  <span className={s.name}>{c.name}</span>
                </div>
                <div>
                  <span className={`${s.status} ${run ? s.stRun : s.stExit}`}>
                    {run ? 'running' : 'exited'}
                  </span>
                </div>
                <div className={s.cpuCell}>
                  <div className={s.track}>
                    <div className={s.fill} style={{ width: `${cpuW}%`, background: barColor(cpu * 2.6) }} />
                  </div>
                  <span className={s.cpuTxt}>{cpu.toFixed(1)}%</span>
                </div>
                <div className={s.ramCell}>{c.memory_usage ? fmtMB(c.memory_usage) : '—'}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
