import { useEffect, useRef } from 'react'
import { TEACHING_PATTERNS } from '@/academy/patternGeometry'
import type { TimeSignature } from '@/config/gestureConfig'
import type { GestureInput } from '@/conducting/gestureInput'

interface Pt { x: number; y: number; t: number }
const TRAIL_MS = 1800
const GOLD = '196,163,90'

/**
 * Conducting trajectory: the right palm's recent path (auto-scaled to its own range so it fills the box), a faint
 * ghost of the expected pattern, and a marker at every detected beat. Draws straight from the processed-frame stream
 * (no React state per frame).
 */
export function TrajectoryCanvas({ input, timeSignature }: { input: GestureInput; timeSignature: TimeSignature }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const ts = useRef(timeSignature)
  useEffect(() => {
    ts.current = timeSignature
  }, [timeSignature])

  useEffect(() => {
    const canvas = ref.current
    const trail: Pt[] = []
    const beats: (Pt & { n: number })[] = []
    let box = { x0: 0.45, x1: 0.95, y0: 0.2, y1: 0.8 }
    const unsub = input.onProcessed(({ frame, events, snapshot }) => {
      const c = ref.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      const t = frame.timestampMs
      const h = frame.right
      if (h && h.status === 'tracking') trail.push({ x: h.palm.x, y: h.palm.y, t })
      while (trail.length && t - trail[0].t > TRAIL_MS) trail.shift()
      for (const e of events) if (e.type === 'beat' && trail.length) beats.push({ ...trail[trail.length - 1], t, n: e.beatInBar })
      while (beats.length && t - beats[0].t > TRAIL_MS * 1.5) beats.shift()
      if (trail.length > 4) {
        const xs = trail.map((p) => p.x)
        const ys = trail.map((p) => p.y)
        const pad = 0.04
        const tx = { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad }
        const k = 0.08 // slow auto-zoom so the picture is stable
        box = { x0: box.x0 + k * (tx.x0 - box.x0), x1: box.x1 + k * (tx.x1 - box.x1), y0: box.y0 + k * (tx.y0 - box.y0), y1: box.y1 + k * (tx.y1 - box.y1) }
      }
      const W = c.width
      const H = c.height
      const sx = (x: number) => ((x - box.x0) / Math.max(0.15, box.x1 - box.x0)) * (W - 24) + 12
      const sy = (y: number) => ((y - box.y0) / Math.max(0.15, box.y1 - box.y0)) * (H - 24) + 12
      ctx.clearRect(0, 0, W, H)

      // ghost pattern
      const pat = TEACHING_PATTERNS[ts.current].ictus
      const gx = (p: { x: number }) => 24 + (p.x / 100) * (W - 48)
      const gy = (p: { y: number }) => 18 + (p.y / 100) * (H - 36)
      ctx.strokeStyle = `rgba(${GOLD},0.16)`
      ctx.setLineDash([4, 5])
      ctx.beginPath()
      pat.forEach((p, i) => (i === 0 ? ctx.moveTo(gx(p), gy(p)) : ctx.lineTo(gx(p), gy(p))))
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])
      pat.forEach((p, i) => {
        const next = snapshot.expectedBeat === i + 1
        ctx.strokeStyle = `rgba(${GOLD},${next ? 0.9 : 0.25})`
        ctx.lineWidth = next ? 2 : 1
        ctx.beginPath()
        ctx.arc(gx(p), gy(p), next ? 9 : 6, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = `rgba(243,236,220,${next ? 0.9 : 0.35})`
        ctx.font = '11px Inter, sans-serif'
        ctx.fillText(String(i + 1), gx(p) + 10, gy(p) - 8)
      })
      ctx.lineWidth = 1

      // live trail (fading)
      for (let i = 1; i < trail.length; i++) {
        const age = (t - trail[i].t) / TRAIL_MS
        ctx.strokeStyle = `rgba(${GOLD},${Math.max(0, 1 - age)})`
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(sx(trail[i - 1].x), sy(trail[i - 1].y))
        ctx.lineTo(sx(trail[i].x), sy(trail[i].y))
        ctx.stroke()
      }
      const last = trail.at(-1)
      if (last) {
        ctx.fillStyle = `rgb(${GOLD})`
        ctx.beginPath()
        ctx.arc(sx(last.x), sy(last.y), 4, 0, Math.PI * 2)
        ctx.fill()
      }
      for (const b of beats) {
        ctx.fillStyle = 'rgba(243,236,220,0.9)'
        ctx.beginPath()
        ctx.arc(sx(b.x), sy(b.y), 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0b0a09'
        ctx.font = '600 8px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(b.n), sx(b.x), sy(b.y) + 3)
        ctx.textAlign = 'start'
      }
    })
    return () => {
      unsub()
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [input])

  return <canvas ref={ref} width={320} height={192} role="img" aria-label="Right-hand conducting trajectory" className="h-24 w-full rounded-sm border border-dashed border-ivory/15 bg-ink-950 sm:h-28" />
}
