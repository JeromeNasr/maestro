import { FINGERTIP_INDICES, HAND_CONNECTIONS } from './handTopology'
import type { HandFrame, TrackedHand } from './types'

/** Minimal 2D-context surface used by the renderer (lets tests pass a recording mock). */
export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'arc' | 'fill' | 'fillText' | 'save' | 'restore' | 'setLineDash'
> & { globalAlpha: number; strokeStyle: unknown; fillStyle: unknown; lineWidth: number; font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline }

const COLORS = { left: '#d9bf82', right: '#c4a35a' } as const // soft gold / gold
const BONE = { left: 'rgba(243,236,220,0.85)', right: 'rgba(196,163,90,0.9)' } as const

function drawHand(ctx: OverlayContext, h: TrackedHand, w: number, hgt: number) {
  const holding = h.status === 'holding'
  ctx.save()
  ctx.globalAlpha = holding ? 0.35 : 1
  ctx.setLineDash(holding ? [4, 4] : [])
  ctx.strokeStyle = BONE[h.side]
  ctx.lineWidth = 2
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(h.landmarks[a].x * w, h.landmarks[a].y * hgt)
    ctx.lineTo(h.landmarks[b].x * w, h.landmarks[b].y * hgt)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.fillStyle = COLORS[h.side]
  h.landmarks.forEach((p, i) => {
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * hgt, (FINGERTIP_INDICES as readonly number[]).includes(i) ? 4 : 3, 0, Math.PI * 2)
    ctx.fill()
  })
  // Label chip near the wrist: side + confidence (+ "held" while the hand is temporarily lost).
  ctx.font = '600 13px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#f3ecdc'
  const label = `${h.side === 'left' ? 'LEFT' : 'RIGHT'} ${Math.round(h.confidence * 100)}%${holding ? ' · held' : ''}`
  ctx.fillText(label, h.wrist.x * w, Math.min(hgt - 18, h.wrist.y * hgt + 10))
  ctx.restore()
}

/** Draws both hands' 21-point skeletons. Input is in display space, so it must be drawn on an UN-mirrored canvas. */
export function drawHands(ctx: OverlayContext, frame: HandFrame | null, width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
  if (!frame) return
  if (frame.left) drawHand(ctx, frame.left, width, height)
  if (frame.right) drawHand(ctx, frame.right, width, height)
}
