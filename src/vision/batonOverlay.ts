import type { BatonSession } from './batonSession'
import type { HandFrame } from './types'

let maskCanvas: HTMLCanvasElement | null = null

/**
 * Draws the baton on the (un-mirrored) overlay canvas: the pixels the tracker matched (optional), the recent path of the tip,
 * a line from the right hand to the tip, and the tip itself. All positions are already in display space.
 */
export function drawBaton(ctx: CanvasRenderingContext2D, w: number, h: number, frame: HandFrame | null, baton: BatonSession, showMask: boolean) {
  const mask = showMask ? baton.tracker_.lastMask : null
  if (mask && typeof document !== 'undefined') {
    maskCanvas ??= document.createElement('canvas')
    if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
      maskCanvas.width = mask.width
      maskCanvas.height = mask.height
    }
    const mctx = maskCanvas.getContext('2d')
    if (mctx) {
      const img = mctx.createImageData(mask.width, mask.height)
      for (let i = 0; i < mask.data.length; i++) {
        if (!mask.data[i]) continue
        img.data[i * 4] = 255
        img.data[i * 4 + 1] = 40
        img.data[i * 4 + 2] = 200
        img.data[i * 4 + 3] = 190
      }
      mctx.putImageData(img, 0, 0)
      ctx.save()
      ctx.translate(w, 0) // the mask is in camera orientation; the overlay is in display (mirrored) orientation
      ctx.scale(-1, 1)
      ctx.drawImage(maskCanvas, 0, 0, w, h)
      ctx.restore()
    }
  }
  const tip = frame?.baton
  if (!tip) return
  const trail = baton.trail
  ctx.save()
  if (trail.length > 1) {
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 1; i < trail.length; i++) {
      ctx.strokeStyle = `rgba(243,236,220,${(i / trail.length) * 0.7})`
      ctx.beginPath()
      ctx.moveTo(trail[i - 1].x * w, trail[i - 1].y * h)
      ctx.lineTo(trail[i].x * w, trail[i].y * h)
      ctx.stroke()
    }
  }
  const hand = frame?.right ?? frame?.left
  if (hand) {
    ctx.strokeStyle = 'rgba(243,236,220,.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(hand.palm.x * w, hand.palm.y * h)
    ctx.lineTo(tip.x * w, tip.y * h)
    ctx.stroke()
  }
  ctx.fillStyle = tip.confidence >= 0.45 ? '#f3ecdc' : '#e0894a'
  ctx.strokeStyle = '#0b0a09'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(tip.x * w, tip.y * h, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
