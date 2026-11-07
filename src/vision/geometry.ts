import type { Landmark, Vec2 } from './types'
import { LANDMARK_COUNT, LM, PALM_INDICES } from './handTopology'

/** Raw (un-mirrored camera) → display (mirrored preview) space. */
export const toDisplay = (lm: readonly Landmark[]): Landmark[] => lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }))

export function isValidLandmarks(lm: readonly Landmark[] | undefined): lm is Landmark[] {
  return !!lm && lm.length === LANDMARK_COUNT && lm.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0))
}

/** Palm centre = mean of the wrist and the four finger-base joints (stable while fingers move). */
export function palmCenter(lm: readonly Landmark[]): Vec2 {
  let x = 0
  let y = 0
  for (const i of PALM_INDICES) {
    x += lm[i].x
    y += lm[i].y
  }
  return { x: x / PALM_INDICES.length, y: y / PALM_INDICES.length }
}

/** Wrist → middle-finger base distance, in normalised image units. */
export function handSize(lm: readonly Landmark[]): number {
  return Math.hypot(lm[LM.MIDDLE_MCP].x - lm[LM.WRIST].x, lm[LM.MIDDLE_MCP].y - lm[LM.WRIST].y)
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
