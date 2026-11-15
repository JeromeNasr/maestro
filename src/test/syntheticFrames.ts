import { rng } from './fixtures'
import type { Pixels } from '@/vision/batonTracker'

export interface Disc { x: number; y: number; r: number; rgb: [number, number, number] }

/**
 * A synthetic RGBA camera frame: a wall-coloured background with sensor noise, a skin-coloured "hand" patch, and any
 * number of coloured discs (the marker and look-alikes). `light` scales brightness (a lamp, a cloud), `tint` shifts white balance.
 */
export function renderFrame(opts: { w?: number; h?: number; discs: Disc[]; noise?: number; light?: number; tint?: [number, number, number]; seed?: number; skin?: boolean; blur?: number }): Pixels {
  const w = opts.w ?? 320
  const h = opts.h ?? 240
  const r = rng(opts.seed ?? 1)
  const data = new Uint8ClampedArray(w * h * 4)
  const light = opts.light ?? 1
  const tint = opts.tint ?? [1, 1, 1]
  const noise = opts.noise ?? 6
  const put = (i: number, rgb: [number, number, number]) => {
    data[i] = rgb[0] * light * tint[0] + (r() - 0.5) * noise * 2
    data[i + 1] = rgb[1] * light * tint[1] + (r() - 0.5) * noise * 2
    data[i + 2] = rgb[2] * light * tint[2] + (r() - 0.5) * noise * 2
    data[i + 3] = 255
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put((y * w + x) * 4, [170, 165, 155]) // a beige wall
  if (opts.skin !== false) {
    for (let y = 70; y < 190; y++) for (let x = 40; x < 120; x++) put((y * w + x) * 4, [205, 150, 120]) // a hand-sized skin patch
  }
  for (const d of opts.discs) {
    const blur = opts.blur ?? 0
    const rr = d.r + blur
    for (let y = Math.max(0, Math.floor(d.y - rr - 1)); y <= Math.min(h - 1, Math.ceil(d.y + rr + 1)); y++) {
      for (let x = Math.max(0, Math.floor(d.x - rr - 1)); x <= Math.min(w - 1, Math.ceil(d.x + rr + 1)); x++) {
        const dist = Math.hypot(x - d.x, y - d.y)
        if (dist > d.r + (blur ? blur * 0.6 : 0)) continue
        put((y * w + x) * 4, d.rgb)
      }
    }
  }
  return { data, width: w, height: h }
}

export const GREEN: [number, number, number] = [40, 220, 70]
export const PINK: [number, number, number] = [240, 40, 160]
export const BLUE: [number, number, number] = [30, 90, 230]
export const ORANGE: [number, number, number] = [250, 120, 20]
