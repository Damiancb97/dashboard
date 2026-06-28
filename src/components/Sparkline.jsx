import { useEffect, useRef } from 'react'

// Canvas sparkline ported from the "Dashboard Servidor" design.
// Single series: pass `data` + `color`. Dual series (network): pass `a`/`b`.
export default function Sparkline({ data, color, a, b, colorA, colorB, style }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (a && b) {
      drawDual(ctx, w, h, a, b, colorA, colorB)
    } else if (data) {
      drawSingle(ctx, w, h, data, color)
    }
  })

  return <canvas ref={ref} style={style} />
}

function drawSingle(ctx, w, h, data, color) {
  if (!data || data.length < 2) return
  const mx = Math.max(...data)
  const mn = Math.min(...data)
  const rng = (mx - mn) || 1
  const n = data.length
  const X = i => (n <= 1 ? 0 : (i / (n - 1)) * w)
  const Y = v => (h - 3) - ((v - mn) / rng) * (h - 6)

  ctx.beginPath()
  data.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, color + '40'); g.addColorStop(1, color + '00')
  ctx.fillStyle = g; ctx.fill()

  ctx.beginPath()
  data.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke()
}

function drawDual(ctx, w, h, A, B, ca, cb) {
  if (!A || A.length < 2) return
  const all = A.concat(B)
  const mx = Math.max(...all)
  const mn = Math.min(...all, 0)
  const rng = (mx - mn) || 1
  const n = A.length
  const X = i => (i / (n - 1)) * w
  const Y = v => (h - 3) - ((v - mn) / rng) * (h - 6)

  const line = (D, c, fill) => {
    ctx.beginPath()
    D.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
    if (fill) {
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, c + '2e'); g.addColorStop(1, c + '00')
      ctx.fillStyle = g; ctx.fill()
      ctx.beginPath()
      D.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
    }
    ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke()
  }
  line(A, ca, true)
  line(B, cb, false)
}
