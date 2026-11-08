import { FINGERTIP_INDICES, HAND_CONNECTIONS } from './handTopology'
import type { HandFrame, TrackedHand } from './types'

/** Minimal 2D-context surface used by the renderer (lets tests pass a recording mock). */
export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'arc' | 'fill' | 'fillText' | 'save' | 'restore' | 'setLineDash'
> & { globalAlpha: number; strokeStyle: unknown; fillStyle: unknown; lineWidth: number; font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline }

// The two hands have different jobs, so they get clearly different looks: the right hand (beat) is warm gold, the left
// hand (dynamics) is a cool ivory-blue. Low-confidence tracking is drawn in amber so the user sees it before the music does.
const COLORS = { left: '#9fc3e0', right: '#d8b04a' } as const
const BONE = { left: 'rgba(190,215,235,0.9)', right: 'rgba(232,196,98,0.95)' } as const
const ROLE = { left: 'DYNAMICS', right: 'BEAT' } as const
export const LOW_CONFIDENCE = 0.6

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
  const weak = h.confidence < LOW_CONFIDENCE
  ctx.fillStyle = weak ? '#e0894a' : COLORS[h.side]
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
  const label = `${h.side === 'left' ? 'LEFT' : 'RIGHT'} · ${ROLE[h.side]} ${Math.round(h.confidence * 100)}%${holding ? ' · signal lost' : weak ? ' · weak' : ''}`
  ctx.fillText(label, h.wrist.x * w, Math.min(hgt - 18, h.wrist.y * hgt + 10))
  // A ring around the palm: the point the beat/dynamics logic actually follows.
  ctx.strokeStyle = weak ? '#e0894a' : COLORS[h.side]
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(h.palm.x * w, h.palm.y * hgt, Math.max(10, h.handSize * hgt * 0.55), 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Draws both hands' 21-point skeletons. Input is in display space, so it must be drawn on an UN-mirrored canvas. */
export function drawHands(ctx: OverlayContext, frame: HandFrame | null, width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
  if (!frame) return
  if (frame.left) drawHand(ctx, frame.left, width, height)
  if (frame.right) drawHand(ctx, frame.right, width, height)
}
