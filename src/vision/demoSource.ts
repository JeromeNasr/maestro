import { positionAt, TEACHING_PATTERNS } from '@/academy/patternGeometry'
import type { DetectionResult, Landmark, RawDetection, Side } from './types'
import { LANDMARK_COUNT } from './handTopology'
import { palmCenter } from './geometry'

/**
 * DEMONSTRATION SOURCE — synthetic hands, NOT detected from any camera.
 * Used when no camera is available (or the user just wants to see the interface move). The UI always labels
 * frames from this source as a demonstration. It exercises the same pipeline as the camera, including the
 * tracking-loss handling (the right hand briefly drops out every cycle).
 */

/** Hand template in hand-local units (wrist at origin, fingers up, +x toward the pinky side for a right hand). */
const TEMPLATE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-0.45, -0.25], [-0.75, -0.55], [-0.95, -0.85], [-1.1, -1.1],
  [-0.35, -0.95], [-0.4, -1.35], [-0.42, -1.6], [-0.43, -1.82],
  [0, -1], [0, -1.45], [0, -1.72], [0, -1.95],
  [0.33, -0.95], [0.37, -1.35], [0.39, -1.6], [0.4, -1.8],
  [0.62, -0.85], [0.7, -1.15], [0.74, -1.35], [0.76, -1.52],
]

/**
 * Build 21 landmarks in DISPLAY space with the palm centre at (cx, cy).
 * `size` is the wrist→middle-base distance in normalised y units; x is scaled by 1/aspect so the hand keeps its shape.
 */
export function makeHandLandmarks(cx: number, cy: number, size: number, side: Side, aspect = 4 / 3): Landmark[] {
  const flip = side === 'left' ? -1 : 1
  const pts: Landmark[] = TEMPLATE.map(([lx, ly]) => ({ x: (lx * flip * size) / aspect, y: ly * size, z: 0 }))
  const c = palmCenter(pts)
  return pts.map((p) => ({ x: p.x - c.x + cx, y: p.y - c.y + cy, z: 0 }))
}

export interface DemoOptions {
  bpm: number
  aspect: number
  /** Length of the loop (s) after which the tracking-loss demonstration repeats. */
  loopSec: number
}

const DEFAULTS: DemoOptions = { bpm: 72, aspect: 4 / 3, loopSec: 20 }

export class DemoSource {
  private opts: DemoOptions
  constructor(opts: Partial<DemoOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts }
  }

  /** Whether a hand is "visible" at time t (right hand drops out briefly: 0.15 s and 0.9 s) to show loss handling. */
  isVisible(side: Side, tSec: number): boolean {
    if (side === 'left') return true
    const t = tSec % this.opts.loopSec
    return !((t >= 6 && t < 6.15) || (t >= 13 && t < 13.9))
  }

  /** Display-space palm position of a hand at time t. */
  palmAt(side: Side, tSec: number): { x: number; y: number } {
    if (side === 'right') {
      const { point } = positionAt(TEACHING_PATTERNS['4/4'], (tSec * this.opts.bpm) / 60)
      // y range keeps every fingertip (≈0.19 above the palm centre) and the wrist inside the frame
      return { x: 0.58 + (point.x / 100) * 0.32, y: 0.3 + (point.y / 100) * 0.55 }
    }
    return { x: 0.22, y: 0.5 + 0.22 * Math.sin((2 * Math.PI * tSec) / 8) }
  }

  /** Detections in RAW (un-mirrored) space, labelled as a camera model following MediaPipe's docs would report them. */
  detect(tMs: number): DetectionResult {
    const t = tMs / 1000
    const hands: RawDetection[] = []
    for (const side of ['left', 'right'] as const) {
      if (!this.isVisible(side, t)) continue
      const p = this.palmAt(side, t)
      const display = makeHandLandmarks(p.x, p.y, 0.16, side, this.opts.aspect)
      if (display.length !== LANDMARK_COUNT) continue
      hands.push({
        landmarks: display.map((q) => ({ x: 1 - q.x, y: q.y, z: q.z })),
        label: side === 'left' ? 'Left' : 'Right',
        score: 0.97,
      })
    }
    return { hands }
  }
}
