import './index.css'
import { useGlances } from './hooks/useGlances'
import { useRpiGlances } from './hooks/useRpiGlances'
import {
  barColor, tempColor, fmtUptime, getCpuTemp, getRpiTemp,
} from './lib/format'
import Header from './components/Header'
import SectionHeader from './components/SectionHeader'
import StatCard from './components/StatCard'
import NetworkCard from './components/NetworkCard'
import StorageCard from './components/StorageCard'
import ProcessesCard from './components/ProcessesCard'
import Containers from './components/Containers'
import Services from './components/Services'
import s from './App.module.css'

// MagicDNS host used when the dashboard is opened from a public domain, where
// raw LAN ports aren't exposed but the Tailscale host is reachable.
const TAILSCALE_HOST = 'server'

function resolveLanHost() {
  if (typeof window === 'undefined') return TAILSCALE_HOST
  const h = window.location.hostname
  const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|100\.)/.test(h)
  const isBareHost = !h.includes('.')
  if (isPrivateIp || isBareHost || h === '127.0.0.1') return h
  return TAILSCALE_HOST
}

const LAN_HOST = resolveLanHost()

// Públicos — domains exposed over the internet.
const PUBLIC_SVC = [
  { mono: 'DC', name: 'damiancb.com', sub: 'Portfolio personal', tag: 'damiancb.com', url: 'https://damiancb.com', bg: '#15324f', fg: '#7cc0ff' },
  { mono: 'TG', name: 'timedgg.com', sub: 'World of Warcraft', tag: 'timed.gg', url: 'https://timedgg.com', bg: '#2c2150', fg: '#c4a6ff' },
  { mono: 'AC', name: 'algodonconamor.es', sub: 'Algodón con amor', tag: 'algodon.es', url: 'https://algodonconamor.es', bg: '#4a1f33', fg: '#ff9bc0' },
  { mono: '◉', name: 'cam.damiancb.com', sub: 'Cámara de seguridad', tag: 'cam', url: 'https://cam.damiancb.com', bg: '#143a36', fg: '#5fe3cf' },
  { mono: '>_', name: 'sshserver.damiancb', sub: 'Acceso SSH remoto', tag: 'ssh', url: 'https://sshserver.damiancb.com', bg: '#13351f', fg: '#74e08f' },
  { mono: '>_', name: 'sshraspi.damiancb', sub: 'SSH Raspberry Pi', tag: 'ssh', url: 'https://sshraspi.damiancb.com', bg: '#13351f', fg: '#74e08f' },
  { mono: '⬡', name: 'raspberry.damiancb', sub: 'Portainer Raspberry', tag: 'portainer', url: 'https://raspberry.damiancb.com', bg: '#0f3147', fg: '#5cc6ff' },
]

// Privados — only reachable on the LAN; URL host adapts to how you connect.
const PRIVATE_SVC = [
  { mono: 'PM', port: 8765, name: 'Polymarket · Codex', sub: 'Bot de trading', bg: '#3d2c10', fg: '#f0c068' },
  { mono: 'PM', port: 8501, name: 'Polymarket · Claude', sub: 'Dashboard Streamlit', bg: '#3d2c10', fg: '#f0c068' },
  { mono: 'BI', port: 8088, name: 'Learning-Bet IA', sub: 'Modelo de apuestas', bg: '#2b1d44', fg: '#c8a4ff' },
].map(svc => ({
  ...svc,
  tag: `:${svc.port}`,
  url: `http://${LAN_HOST}:${svc.port}`,
}))

const gbText = (used, total) =>
  used != null && total != null
    ? `${(used / 1073741824).toFixed(1)} / ${(total / 1073741824).toFixed(1)} GB`
    : '—'

export default function App() {
  const g = useGlances()
  const rpi = useRpiGlances()

  const cpuPct = Math.round(g.cpu?.total ?? 0)
  const memPct = Math.round(g.mem?.percent ?? 0)
  const srvTemp = getCpuTemp(g.sensors)

  const gpu = g.gpu
  const gpuLoad = Math.round(gpu?.proc ?? 0)
  const vramPct = Math.round(gpu?.mem ?? 0)

  const rpiCpu = Math.round(rpi.cpu?.total ?? 0)
  const rpiMemPct = Math.round(rpi.mem?.percent ?? 0)
  const rpiTemp = getRpiTemp(rpi.sensors)

  return (
    <div className={s.page}>
      <div className={s.inner}>
        <Header online={g.online} />

        <SectionHeader title="SISTEMA" />
        <div className={s.systemGrid}>
          <StatCard
            title="SERVIDOR" tickColor="#3fb37f" online={g.online}
            metricLabel="CPU" metricValue={cpuPct}
            spark={g.history.serverCpu} sparkColor="#3fb37f"
            barLabel="MEMORIA" barText={gbText(g.mem?.used, g.mem?.total)}
            barPct={memPct} barColor={barColor(memPct)}
            temp={srvTemp ? Math.round(srvTemp.value) : null}
            tempColor={srvTemp ? tempColor(srvTemp.value) : undefined}
            footer={`${g.cpu?.cpucore ?? '—'} núcleos · ${cpuPct}% uso · ${fmtUptime(g.uptime)}`}
          />
          <StatCard
            title="GPU" tickColor="#4f9dff" online={!!gpu}
            metricLabel="CARGA" metricValue={gpuLoad}
            spark={g.history.gpu} sparkColor="#4f9dff"
            barLabel="VRAM" barText={gpu ? gbText(gpu.memory_used * 1048576, gpu.memory_total * 1048576) : '—'}
            barPct={vramPct} barColor={barColor(vramPct)}
            temp={gpu?.temperature != null ? Math.round(gpu.temperature) : null}
            tempColor={gpu?.temperature != null ? tempColor(gpu.temperature) : undefined}
            footer={gpu?.name ?? 'GPU no detectada'}
          />
          <StatCard
            title="RASPBERRY PI" tickColor="#2dd4bf" online={rpi.online}
            metricLabel="CPU" metricValue={rpiCpu}
            spark={rpi.history.rpiCpu} sparkColor="#2dd4bf"
            barLabel="MEMORIA" barText={gbText(rpi.mem?.used, rpi.mem?.total)}
            barPct={rpiMemPct} barColor={barColor(rpiMemPct)}
            temp={rpiTemp ? Math.round(rpiTemp.value) : null}
            tempColor={rpiTemp ? tempColor(rpiTemp.value) : undefined}
            footer={`Raspberry Pi · ${rpi.cpu?.cpucore ?? '—'} núcleos · ${fmtUptime(rpi.uptime)}`}
          />
          <NetworkCard net={g.net} history={g.history} />
        </div>

        <SectionHeader title="ALMACENAMIENTO · PROCESOS" />
        <div className={s.twoCol}>
          <StorageCard disks={g.disks} />
          <ProcessesCard procs={g.procs} />
        </div>

        <SectionHeader title="CONTENEDORES DOCKER" />
        <Containers containers={g.containers} />

        <SectionHeader title="SERVICIOS" />
        <Services publicSvc={PUBLIC_SVC} privSvc={PRIVATE_SVC} lanIp={LAN_HOST} />
      </div>
    </div>
  )
}
