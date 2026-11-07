import type { TimeSignature } from '@/config/gestureConfig'
import { TEACHING_PATTERNS } from '@/academy/patternGeometry'
import type { DirectionName } from './types'

export interface V2 { x: number; y: number }

export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y })
export const norm = (v: V2) => Math.hypot(v.x, v.y)
export const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y
export const unit = (v: V2): V2 => {
  const n = norm(v)
  return n > 1e-9 ? { x: v.x / n, y: v.y / n } : { x: 0, y: 0 }
}
/** Cosine of the angle between two vectors (0 if either is zero). */
export const cosBetween = (a: V2, b: V2): number => {
  const na = norm(a)
  const nb = norm(b)
  return na > 1e-9 && nb > 1e-9 ? dot(a, b) / (na * nb) : 0
}
export const angleBetweenDeg = (a: V2, b: V2): number => (Math.acos(Math.max(-1, Math.min(1, cosBetween(a, b)))) * 180) / Math.PI

const NAMES: DirectionName[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']

/** 8-way direction name for a vector in screen space (+y is down). */
export function directionName(v: V2): DirectionName {
  const a = Math.atan2(v.y, v.x) // 0 = right, +π/2 = down
  const idx = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
  return NAMES[idx]
}

/**
 * Expected stroke vectors, one per beat: the movement that ARRIVES at that beat's ictus, from the previous ictus.
 * Derived from the same teaching geometry the Academy animates, so the recogniser and the lessons cannot disagree.
 *   4/4: down · left(-up) · right · up(-left)      3/4: down · right(-up) · up(-left)      2/4: down · up
 */
export function expectedStrokes(ts: TimeSignature): V2[] {
  const ictus = TEACHING_PATTERNS[ts].ictus
  const n = ictus.length
  return ictus.map((p, i) => unit(sub(p, ictus[(i + n - 1) % n])))
}

export const beatsPerBar = (ts: TimeSignature): number => TEACHING_PATTERNS[ts].ictus.length
