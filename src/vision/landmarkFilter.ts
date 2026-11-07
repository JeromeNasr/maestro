import { OneEuroFilter } from '@/lib/oneEuro'
import type { Landmark } from './types'
import { LANDMARK_COUNT } from './handTopology'

/** Smooths all 21 landmarks of one hand (x, y, z) with One-Euro filters. */
export class LandmarkFilter {
  private filters: OneEuroFilter[] = Array.from({ length: LANDMARK_COUNT * 3 }, () => new OneEuroFilter())

  /** Parameters are applied on every call so live config changes take effect immediately. */
  apply(landmarks: readonly Landmark[], tSec: number, minCutoff: number, beta: number): Landmark[] {
    return landmarks.map((p, i) => {
      const fx = this.filters[i * 3]
      const fy = this.filters[i * 3 + 1]
      const fz = this.filters[i * 3 + 2]
      for (const f of [fx, fy, fz]) {
        f.minCutoff = minCutoff
        f.beta = beta
      }
      return { x: fx.filter(p.x, tSec), y: fy.filter(p.y, tSec), z: fz.filter(p.z ?? 0, tSec) }
    })
  }

  reset() {
    this.filters.forEach((f) => f.reset())
  }
}
