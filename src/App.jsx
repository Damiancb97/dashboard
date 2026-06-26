import './index.css'
import Clock from './components/Clock'
import Weather from './components/Weather'
import ServerStats from './components/ServerStats'
import GpuStats from './components/GpuStats'
import Containers from './components/Containers'
import RpiStats from './components/RpiStats'
import SiteCard from './components/SiteCard'
import s from './App.module.css'

// Nombre MagicDNS del servidor en Tailscale. Se usa como destino cuando el
// dashboard se abre desde un dominio público, donde los puertos crudos no se
// exponen pero el host de Tailscale sí es alcanzable.
const TAILSCALE_HOST = 'server'

// Host al que apuntar los servicios LAN. Si entras directo por IP LAN, IP
// Tailscale, MagicDNS o localhost, se reutiliza ese mismo host (los servicios
// bindean a 0.0.0.0 y responden ahí). Si entras por un dominio público
// (p.ej. home.damiancb.com), se cae al host de Tailscale.
function resolveLanHost() {
  if (typeof window === 'undefined') return TAILSCALE_HOST
  const h = window.location.hostname
  const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|100\.)/.test(h)
  const isBareHost = !h.includes('.') // localhost, server, etc.
  if (isPrivateIp || isBareHost || h === '127.0.0.1') return h
  return TAILSCALE_HOST
}

const LAN_HOST = resolveLanHost()

const LAN_SERVICES = [
  { port: 8501, icon: '/icons/polymarket-claude.svg', description: 'Bot Polymarket (Claude)' },
  { port: 8765, icon: '/icons/polymarket-codex.svg', description: 'Bot Polymarket (Codex)' },
  { port: 8088, icon: '/icons/learning-ia.svg', description: 'Learning · Modelo IA' },
].map(({ port, icon, description }) => ({
  name: `${LAN_HOST}:${port}`,
  url: `http://${LAN_HOST}:${port}`,
  icon,
  description,
}))

const SITES = [
  {
    name: 'damiancb.com',
    url: 'https://damiancb.com',
    icon: 'https://www.google.com/s2/favicons?domain=damiancb.com&sz=64',
    description: 'Portfolio personal',
  },
  {
    name: 'timedgg.com',
    url: 'https://timedgg.com',
    icon: '/icons/favicon_round.png',
    description: 'World of Warcraft',
  },
  {
    name: 'algodonconamor.es',
    url: 'https://algodonconamor.es',
    icon: 'https://algodonconamor.es/favicon.ico',
    description: 'Algodón con amor',
  },
  {
    name: 'cam.damiancb.com',
    url: 'https://cam.damiancb.com',
    icon: '/icons/cam-icon.svg',
    description: 'Cámara de seguridad',
  },
  {
    name: 'sshserver.damiancb.com',
    url: 'https://sshserver.damiancb.com',
    icon: '/icons/ssh-icon.svg',
    description: 'Acceso SSH remoto',
  },
  {
    name: 'sshraspi.damiancb.com',
    url: 'https://sshraspi.damiancb.com',
    icon: '/icons/ssh-icon.svg',
    description: 'Acceso SSH Raspberry Pi',
  },
  {
    name: 'raspberry.damiancb.com',
    url: 'https://raspberry.damiancb.com',
    icon: 'https://www.google.com/s2/favicons?domain=raspberry.damiancb.com&sz=64',
    description: 'Portainer Raspberry Pi',
  },
  ...LAN_SERVICES,
]

export default function App() {
  return (
    <div className={s.layout}>
      <header className={s.header}>
        <span className={s.title}>Damiancb<span className={s.robot}>🤖</span></span>
      </header>

      <main className={s.grid}>
        <div className={s.leftCol}>
          <Clock />
          <Weather />
          <div className={s.sites}>
            {SITES.map(site => <SiteCard key={site.url} {...site} />)}
          </div>
        </div>

        <div className={s.rightCol}>
          <ServerStats />
          <GpuStats />
          <RpiStats />
          <Containers />
        </div>
      </main>
    </div>
  )
}
