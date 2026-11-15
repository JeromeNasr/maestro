import { OneEuroFilter } from '@/lib/oneEuro'
import { HandKinematics } from './handKinematics'
import type { BatonColor, BatonSample, Vec2 } from './types'

/**
 * Baton-tip tracking by a COLOURED MARKER, calibrated by the user.
 *
 * Why this and not "find the stick": a thin, low-contrast, motion-blurred line is not reliably visible to a webcam, and a
 * fixed colour (say "red") breaks with every lamp, white balance and wall. So the user puts a vivid marker on the tip (tape,
 * a sticker, a small ball) and CLICKS it once in the preview: the colour is sampled from this camera in this room, and from
 * then on a pixel matches if its hue, saturation and brightness are near that sample. The blob of matching pixels, nearest to
 * where the tip was a moment ago, is the tip.
 *
 * Pure and synchronous: it works on an RGBA pixel array (e.g. a 320×240 canvas read-back), so it is fully testable.
 * It reports a confidence and can say why it is not sure; it never invents a position.
 */
export interface Pixels {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

export interface BatonOptions {
  /** Hue half-width at tolerance 0.5, degrees. Scales with the tolerance setting. */
  hueTolDeg: number
  /** Blob size limits as a fraction of the frame area. */
  minAreaFrac: number
  maxAreaFrac: number
  /** A tip that has not been seen for this long is searched for anywhere again (ms). */
  memoryMs: number
}

export const DEFAULT_BATON_OPTIONS: BatonOptions = { hueTolDeg: 16, minAreaFrac: 0.00008, maxAreaFrac: 0.03, memoryMs: 450 }

export function rgbToHsv(r: number, g: number, b: number): BatonColor {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

const hueDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Result of clicking on the preview. */
export interface PickResult {
  color: BatonColor | null
  /** Why the pick is poor, in plain words (null = fine). */
  warning: string | null
}

/**
 * The marker colour at a click: the median of a small patch (robust to a stray pixel), with advice if the colour is a bad
 * choice. `x`, `y` are in RAW image fractions (0–1, un-mirrored).
 */
export function pickColor(img: Pixels, x: number, y: number, radius = 3): PickResult {
  const cx = Math.round(x * (img.width - 1))
  const cy = Math.round(y * (img.height - 1))
  const hs: number[] = []
  const ss: number[] = []
  const vs: number[] = []
  // hue is circular: collect unit vectors instead of averaging angles
  let hx = 0
  let hy = 0
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx
      const py = cy + dy
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue
      const i = (py * img.width + px) * 4
      const c = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2])
      if (c.s > 0.15) {
        hx += Math.cos((c.h * Math.PI) / 180) * c.s
        hy += Math.sin((c.h * Math.PI) / 180) * c.s
      }
      ss.push(c.s)
      vs.push(c.v)
      hs.push(c.h)
    }
  }
  if (!ss.length) return { color: null, warning: 'Click inside the picture.' }
  ss.sort((a, b) => a - b)
  vs.sort((a, b) => a - b)
  const s = ss[ss.length >> 1]
  const v = vs[vs.length >> 1]
  let h = (Math.atan2(hy, hx) * 180) / Math.PI
  if (h < 0) h += 360
  const color: BatonColor = { h, s, v }
  let warning: string | null = null
  if (s < 0.35) warning = 'That spot is not very colourful. Click the marker itself, and use a vivid colour (green, blue, pink, bright orange).'
  else if (v < 0.25) warning = 'That spot is too dark to track. Light the marker, or choose a brighter one.'
  else if (h >= 5 && h <= 45 && s < 0.7) warning = 'That colour is close to skin tones, so your hand could be mistaken for the tip. A green, blue or pink marker works better.'
  return { color, warning }
}

/** Does this pixel match the marker? `tol` 0–1 scales how forgiving the match is. */
function matcher(color: BatonColor, tol: number, o: BatonOptions) {
  const hueTol = o.hueTolDeg * (0.4 + 1.2 * tol)
  const sMin = Math.max(0.22, color.s * (0.72 - 0.35 * tol))
  const vMin = Math.max(0.14, color.v * (0.62 - 0.3 * tol))
  return (r: number, g: number, b: number): boolean => {
    const max = Math.max(r, g, b) / 255
    const min = Math.min(r, g, b) / 255
    if (max < vMin) return false
    const s = max === 0 ? 0 : (max - min) / max
    if (s < sMin) return false
    return hueDiff(rgbToHsv(r, g, b).h, color.h) <= hueTol
  }
}

/** Fraction of the frame that matches the marker colour: if it is large, the colour is not distinctive in this room. */
export function matchFraction(img: Pixels, color: BatonColor, tol: number, o: BatonOptions = DEFAULT_BATON_OPTIONS): number {
  const m = matcher(color, tol, o)
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) if (m(img.data[i], img.data[i + 1], img.data[i + 2])) n++
  return n / (img.width * img.height)
}

interface Blob {
  area: number
  cx: number
  cy: number
  w: number
  h: number
}

export class BatonTracker {
  private color: BatonColor | null = null
  private tol = 0.5
  private opts: BatonOptions
  private fx = new OneEuroFilter(2.5, 8)
  private fy = new OneEuroFilter(2.5, 8)
  private kin = new HandKinematics()
  private last: { x: number; y: number; t: number } | null = null
  private conf = 0
  private mask: Uint8Array | null = null
  private mw = 0
  private mh = 0

  constructor(opts: Partial<BatonOptions> = {}) {
    this.opts = { ...DEFAULT_BATON_OPTIONS, ...opts }
  }

  setColor(c: BatonColor | null) {
    this.color = c
    this.reset()
  }
  setTolerance(t: number) {
    this.tol = Math.min(1, Math.max(0, t))
  }
  get hasColor(): boolean {
    return this.color !== null
  }
  reset() {
    this.last = null
    this.conf = 0
    this.fx.reset()
    this.fy.reset()
    this.kin.reset()
  }

  /** The pixels matched on the last frame (for the calibration preview): a width×height 0/1 mask, or null. */
  get lastMask(): { data: Uint8Array; width: number; height: number } | null {
    return this.mask ? { data: this.mask, width: this.mw, height: this.mh } : null
  }

  /** Find the tip in this frame. Returns null when there is no confident blob (never a guess). */
  track(img: Pixels, tMs: number): BatonSample | null {
    const color = this.color
    if (!color) return null
    const { width: w, height: h, data } = img
    if (!this.mask || this.mw !== w || this.mh !== h) {
      this.mask = new Uint8Array(w * h)
      this.mw = w
      this.mh = h
    }
    const mask = this.mask
    const match = matcher(color, this.tol, this.opts)
    for (let p = 0, i = 0; p < w * h; p++, i += 4) mask[p] = match(data[i], data[i + 1], data[i + 2]) ? 1 : 0

    const blobs = this.blobs(mask, w, h)
    const total = w * h
    const minA = Math.max(3, this.opts.minAreaFrac * total)
    const maxA = this.opts.maxAreaFrac * total
    const recent = this.last && tMs - this.last.t <= this.opts.memoryMs ? this.last : null
    let best: { b: Blob; score: number; compact: number } | null = null
    for (const b of this.merge(blobs, w, h)) {
      if (b.area < minA || b.area > maxA) continue
      const compact = b.area / Math.max(1, b.w * b.h) // a disc fills ~0.78 of its box; a line or an edge much less
      const elong = Math.max(b.w, b.h) / Math.max(1, Math.min(b.w, b.h))
      if (compact < 0.3 || elong > 3.2) continue // a marker is roughly round; lines, edges and long streaks are not
      let score = Math.min(b.area, 60) * (0.4 + compact)
      if (recent) {
        const dist = Math.hypot(b.cx / w - recent.x, (b.cy / h - recent.y) * (h / w)) // in widths
        score /= 1 + (dist / 0.12) ** 2 // a blob far from where the tip just was is probably something else
      }
      if (!best || score > best.score) best = { b, score, compact }
    }
    if (!best) {
      this.conf *= 0.5
      if (this.last && tMs - this.last.t > this.opts.memoryMs) this.reset()
      return null
    }
    const { b, compact } = best
    const rawX = b.cx / w
    const rawY = b.cy / h
    const sizeScore = Math.min(1, b.area / Math.max(8, 0.0004 * total))
    const instant = Math.min(1, 0.55 * sizeScore + 0.45 * Math.min(1, compact / 0.6))
    this.conf = this.conf === 0 ? instant : 0.5 * this.conf + 0.5 * instant
    // Raw → display (mirrored) space, then smooth: a tip moves fast, so the filter must not lag it (One-Euro, high beta).
    const dx = 1 - rawX
    const tSec = tMs / 1000
    const x = this.fx.filter(dx, tSec)
    const y = this.fy.filter(rawY, tSec)
    const pos: Vec2 = { x, y }
    this.last = { x: rawX, y: rawY, t: tMs }
    const k = this.kin.update(pos, tMs)
    return { x, y, confidence: this.conf, area: b.area / total, velocity: k.velocity, speed: k.speed, timestampMs: tMs }
  }

  /** 4-connected components of the mask. */
  private blobs(mask: Uint8Array, w: number, h: number): Blob[] {
    const seen = new Uint8Array(w * h)
    const out: Blob[] = []
    const stack: number[] = []
    for (let s = 0; s < w * h; s++) {
      if (!mask[s] || seen[s]) continue
      let area = 0
      let sx = 0
      let sy = 0
      let x0 = w
      let x1 = 0
      let y0 = h
      let y1 = 0
      stack.push(s)
      seen[s] = 1
      while (stack.length) {
        const p = stack.pop()!
        const px = p % w
        const py = (p / w) | 0
        area++
        sx += px
        sy += py
        if (px < x0) x0 = px
        if (px > x1) x1 = px
        if (py < y0) y0 = py
        if (py > y1) y1 = py
        if (px > 0 && mask[p - 1] && !seen[p - 1]) {
          seen[p - 1] = 1
          stack.push(p - 1)
        }
        if (px < w - 1 && mask[p + 1] && !seen[p + 1]) {
          seen[p + 1] = 1
          stack.push(p + 1)
        }
        if (py > 0 && mask[p - w] && !seen[p - w]) {
          seen[p - w] = 1
          stack.push(p - w)
        }
        if (py < h - 1 && mask[p + w] && !seen[p + w]) {
          seen[p + w] = 1
          stack.push(p + w)
        }
      }
      out.push({ area, cx: sx / area + 0.5, cy: sy / area + 0.5, w: x1 - x0 + 1, h: y1 - y0 + 1 })
    }
    return out
  }

  /** Blobs a pixel or two apart (a marker broken by a glint or by noise) are one marker. */
  private merge(blobs: Blob[], w: number, h: number): Blob[] {
    if (blobs.length < 2) return blobs
    const gap = Math.max(2, 0.008 * Math.max(w, h))
    const out: Blob[] = []
    for (const b of blobs) {
      const near = out.find((o) => Math.abs(o.cx - b.cx) <= (o.w + b.w) / 2 + gap && Math.abs(o.cy - b.cy) <= (o.h + b.h) / 2 + gap)
      if (near) {
        const area = near.area + b.area
        const x0 = Math.min(near.cx - near.w / 2, b.cx - b.w / 2)
        const x1 = Math.max(near.cx + near.w / 2, b.cx + b.w / 2)
        const y0 = Math.min(near.cy - near.h / 2, b.cy - b.h / 2)
        const y1 = Math.max(near.cy + near.h / 2, b.cy + b.h / 2)
        near.cx = (near.cx * near.area + b.cx * b.area) / area
        near.cy = (near.cy * near.area + b.cy * b.area) / area
        near.area = area
        near.w = x1 - x0
        near.h = y1 - y0
      } else out.push({ ...b })
    }
    return out
  }
}
