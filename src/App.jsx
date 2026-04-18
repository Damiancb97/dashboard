import './index.css'
import Clock from './components/Clock'
import Weather from './components/Weather'
import ServerStats from './components/ServerStats'
import GpuStats from './components/GpuStats'
import Containers from './components/Containers'
import RpiStats from './components/RpiStats'
import SiteCard from './components/SiteCard'
import s from './App.module.css'

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
