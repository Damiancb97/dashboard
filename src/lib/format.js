// Shared formatting + color helpers, ported from the "Dashboard Servidor" design.

// Bar color by usage percent: green < 70, gold 70–88, red >= 88.
export function barColor(pct) {
  return pct >= 88 ? '#f15c5c' : pct >= 70 ? '#e0a800' : '#3fb37f'
}

// Temperature color: green < 58, gold 58–70, red >= 70.
export function tempColor(t) {
  return t >= 70 ? '#f15c5c' : t >= 58 ? '#e0a800' : '#3fb37f'
}

// Bytes → human size (GB / TB), e.g. 982240026624 → "915 GB".
export function fmtBytes(bytes) {
  if (bytes == null) return '—'
  const gb = bytes / 1073741824
  return fmtSizeGB(gb)
}

// Gigabytes → "915 GB" / "4.0 TB".
export function fmtSizeGB(gb) {
  if (gb == null) return '—'
  if (gb >= 1000) {
    return (gb / 1000).toFixed(gb >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + ' TB'
  }
  return Math.round(gb) + ' GB'
}

// "used / total GB" pair, e.g. (7.4e9, 16e9) → "6.9 / 14.9 GB". Used for the
// memory/VRAM bars where both values are always shown in GB.
export function fmtGBPair(used, total) {
  if (used == null || total == null) return '—'
  const gb = b => (b / 1073741824).toFixed(1)
  return `${gb(used)} / ${gb(total)} GB`
}

// Bytes → "182 MB" / "1.4 GB" (for RAM-sized values).
export function fmtMB(bytes) {
  if (bytes == null) return '—'
  return bytes >= 1073741824
    ? (bytes / 1073741824).toFixed(1) + ' GB'
    : Math.round(bytes / 1048576) + ' MB'
}

// Mbps from a per-second byte rate.
export function bytesToMbps(bytesPerSec) {
  return (bytesPerSec * 8) / 1e6
}

// Glances uptime is a string like "2 days, 4:24:58" or a seconds number.
// → "up 2d 4h".
export function fmtUptime(uptime) {
  if (uptime == null) return ''
  let totalSeconds
  if (typeof uptime === 'number') {
    totalSeconds = uptime
  } else {
    const str = String(uptime)
    const dayMatch = str.match(/(\d+)\s*day/)
    const days = dayMatch ? parseInt(dayMatch[1], 10) : 0
    const timeMatch = str.match(/(\d+):(\d+):(\d+)/)
    const hours = timeMatch ? parseInt(timeMatch[1], 10) : 0
    const mins = timeMatch ? parseInt(timeMatch[2], 10) : 0
    if (days > 0) return `up ${days}d ${hours}h`
    if (hours > 0) return `up ${hours}h ${mins}m`
    return `up ${mins}m`
  }
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  return days > 0 ? `up ${days}d ${hours}h` : `up ${hours}h`
}

// CPU package temperature from the Glances sensors list (server).
export function getCpuTemp(sensors) {
  if (!Array.isArray(sensors)) return null
  const pkg = sensors.find(s => s.label === 'Package id 0' && s.type === 'temperature_core')
  if (pkg) return pkg
  return sensors.find(s => s.type === 'temperature_core') ?? null
}

// CPU temperature from the Raspberry Pi sensors list.
export function getRpiTemp(sensors) {
  if (!Array.isArray(sensors)) return null
  return (
    sensors.find(s => s.label?.toLowerCase().includes('cpu_thermal')) ??
    sensors.find(s => s.label?.toLowerCase().includes('bcm2835')) ??
    sensors.find(s => s.type === 'temperature_core') ??
    null
  )
}
