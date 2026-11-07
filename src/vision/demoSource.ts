import { positionAt, TEACHING_PATTERNS } from '@/academy/patternGeometry'
import type { TimeSignature } from '@/config/gestureConfig'
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

export type Num = number | ((tSec: number) => number)
const val = (v: Num, t: number) => (typeof v === 'function' ? v(t) : v)

export interface DemoOptions {
  /** Conducted beats per minute (may vary with time). */
  bpm: Num
  timeSignature: TimeSignature
  aspect: number
  /** Left-hand height, 0 (low) … 1 (high); 'wave' = a slow up/down demonstration. */
  leftLevel: Num | 'wave'
  /** 'bounce' comes to rest at every ictus; 'flowing' keeps moving through it (a rebound), like many real conductors. */
  style: 'bounce' | 'flowing'
  /** Briefly hide the right hand to demonstrate tracking-loss handling (every 20 s). */
  dropouts: boolean
  /** Custom per-hand visibility (overrides `dropouts`). */
  visible?: (side: Side, tSec: number) => boolean
  /** Landmark jitter amplitude (normalised units), deterministic. */
  noise: number
  /** Scales the conducting stroke size (1 = default). */
  scale: number
  /** Override a hand's palm path entirely (display space); used to simulate non-conducting movement. */
  paths?: Partial<Record<Side, (tSec: number) => { x: number; y: number }>>
  seed: number
  /** Detector score reported for the hands (0–1). */
  score: number
}

const DEFAULTS: DemoOptions = { bpm: 72, timeSignature: '4/4', aspect: 4 / 3, leftLevel: 'wave', style: 'bounce', dropouts: true, noise: 0, scale: 1, seed: 1, score: 0.97 }

/**
 * 'flowing' easing: the hand does not come to a stop at each ictus (speed there stays ≈ 60% of the average) but still
 * reverses direction sharply, like a rebound. Along each straight segment between ictus points.
 */
const smooth = (u: number) => u * u * (3 - 2 * u)
const rebound = (u: number) => 0.6 * u + 0.4 * smooth(u)

function flowing(points: { x: number; y: number }[], phase: number) {
  const n = points.length
  const p = ((phase % n) + n) % n
  const k = Math.floor(p)
  const u = rebound(p - k)
  const a = points[k]
  const b = points[(k + 1) % n]
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
}

export class DemoSource {
  private opts: DemoOptions
  private phase = 0
  private lastT: number | null = null
  private rnd: () => number

  constructor(opts: Partial<DemoOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts }
    let st = this.opts.seed
    this.rnd = () => {
      st = (st * 1664525 + 1013904223) % 4294967296
      return st / 4294967296
    }
  }

  // Live controls (used by the Studio's demo-conductor sliders).
  setBpm(bpm: Num) { this.opts.bpm = bpm }
  setLeftLevel(l: Num | 'wave') { this.opts.leftLevel = l }
  setTimeSignature(ts: TimeSignature) { this.opts.timeSignature = ts; this.phase = 0 }

  /** Whether a hand is visible at time t. By default the right hand briefly drops out (0.15 s and 0.9 s per 20 s loop). */
  isVisible(side: Side, tSec: number): boolean {
    if (this.opts.visible) return this.opts.visible(side, tSec)
    if (!this.opts.dropouts || side === 'left') return true
    const t = tSec % 20
    return !((t >= 6 && t < 6.15) || (t >= 13 && t < 13.9))
  }

  /** Right-hand palm (display space) at a beat phase (0 = ictus of beat 1). */
  rightPalmAtPhase(phase: number): { x: number; y: number } {
    const pattern = TEACHING_PATTERNS[this.opts.timeSignature]
    const pt = this.opts.style === 'flowing' ? flowing(pattern.ictus, phase) : positionAt(pattern, phase).point
    const k = this.opts.scale
    // y range keeps every fingertip (≈0.19 above the palm centre) and the wrist inside the frame
    return { x: 0.58 + ((pt.x - 50) / 100) * 0.34 * k + 0.1, y: 0.55 + ((pt.y - 50) / 100) * 0.5 * k }
  }

  /** Display-space palm position of a hand at time t (the right hand assumes a constant tempo). */
  palmAt(side: Side, tSec: number): { x: number; y: number } {
    const custom = this.opts.paths?.[side]
    if (custom) return custom(tSec)
    if (side === 'right') return this.rightPalmAtPhase((tSec * val(this.opts.bpm, tSec)) / 60)
    const l = this.opts.leftLevel
    if (l === 'wave') return { x: 0.22, y: 0.5 + 0.22 * Math.sin((2 * Math.PI * tSec) / 8) }
    return { x: 0.22, y: 0.8 - Math.max(0, Math.min(1, val(l, tSec))) * 0.6 }
  }

  /** Detections in RAW (un-mirrored) space, labelled as a camera model following MediaPipe's docs would report them. Call with increasing time. */
  detect(tMs: number): DetectionResult {
    const t = tMs / 1000
    if (this.lastT !== null) this.phase += (Math.max(0, t - this.lastT) * val(this.opts.bpm, t)) / 60
    this.lastT = t
    const hands: RawDetection[] = []
    for (const side of ['left', 'right'] as const) {
      if (!this.isVisible(side, t)) continue
      const p = this.opts.paths?.[side] ? this.palmAt(side, t) : side === 'right' ? this.rightPalmAtPhase(this.phase) : this.palmAt('left', t)
      const display = makeHandLandmarks(p.x, p.y, 0.16, side, this.opts.aspect)
      if (display.length !== LANDMARK_COUNT) continue
      const n = this.opts.noise
      hands.push({
        landmarks: display.map((q) => ({ x: 1 - q.x + (n ? (this.rnd() - 0.5) * n : 0), y: q.y + (n ? (this.rnd() - 0.5) * n : 0), z: q.z })),
        label: side === 'left' ? 'Left' : 'Right',
        score: this.opts.score,
      })
    }
    return { hands }
  }
}
