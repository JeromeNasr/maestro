import type { GestureConfig } from '@/config/gestureConfig'
import { FINGERTIP_INDICES } from './handTopology'
import { handSize, isValidLandmarks, palmCenter, toDisplay } from './geometry'
import { HandKinematics } from './handKinematics'
import { effectiveHandedness, type HandednessResolution } from './handedness'
import { HandIdentityTracker, type IdentityCandidate } from './handIdentity'
import { LandmarkFilter } from './landmarkFilter'
import { TrackingMonitor } from './trackingMonitor'
import type { DetectionResult, DetectionSummary, FrameSource, HandFrame, Side, TrackedHand } from './types'

interface Candidate extends IdentityCandidate {
  landmarks: ReturnType<typeof toDisplay>
}

export interface PipelineDeps {
  getConfig: () => GestureConfig
  getHandedness: () => HandednessResolution
}

/**
 * Pure per-frame processing: raw detections → display space → left/right resolution → smoothing →
 * kinematics → tracking-loss handling. No DOM, no timers: time is passed in, so it is fully testable.
 */
export class HandPipeline {
  private filters: Record<Side, LandmarkFilter> = { left: new LandmarkFilter(), right: new LandmarkFilter() }
  private kin: Record<Side, HandKinematics> = { left: new HandKinematics(), right: new HandKinematics() }
  private monitor: TrackingMonitor<TrackedHand>
  readonly identity = new HandIdentityTracker()
  /** Last accepted raw palm per hand, and a jump waiting for confirmation (see `isGlitch`). */
  private lastRaw: Record<Side, { palm: { x: number; y: number }; size: number; t: number } | null> = { left: null, right: null }
  private pending: Record<Side, { x: number; y: number } | null> = { left: null, right: null }

  constructor(private deps: PipelineDeps) {
    this.monitor = new TrackingMonitor<TrackedHand>({
      graceMs: () => deps.getConfig().tracking.lossGraceMs,
      windowFrames: 90,
      confidenceSmoothing: 0.3,
    })
  }

  process(result: DetectionResult, nowMs: number, source: FrameSource = 'camera'): HandFrame {
    const cfg = this.deps.getConfig()
    const res = this.deps.getHandedness()

    const candidates: Candidate[] = result.hands
      .filter((h) => isValidLandmarks(h.landmarks))
      .map((h) => {
        const landmarks = toDisplay(h.landmarks)
        return { label: h.label, score: h.score, palm: palmCenter(landmarks), size: handSize(landmarks), landmarks }
      })
    const detections: DetectionSummary[] = candidates.map((c) => ({ reportedLabel: c.label, score: c.score, palm: c.palm }))
    const assigned = this.identity.assign(candidates, res, nowMs)

    const observed: Record<Side, TrackedHand | null> = { left: null, right: null }
    for (const side of ['left', 'right'] as const) {
      const a = assigned[side]
      if (!a) continue
      if (this.isGlitch(side, a.candidate.palm, a.candidate.size, nowMs)) continue
      const lm = this.filters[side].apply(a.candidate.landmarks, nowMs / 1000, cfg.tracking.filterMinCutoff, cfg.tracking.filterBeta)
      const palm = palmCenter(lm)
      observed[side] = {
        side,
        status: 'tracking',
        landmarks: lm,
        wrist: lm[0],
        palm,
        fingertips: FINGERTIP_INDICES.map((i) => lm[i]),
        handSize: handSize(lm),
        confidence: a.candidate.score,
        kinematics: this.kin[side].update(palm, nowMs),
        labelSource: a.source,
        handednessVerified: res.verified,
      }
    }

    const monitored = this.monitor.update(nowMs, observed)
    const out: Record<Side, TrackedHand | null> = { left: null, right: null }
    for (const side of ['left', 'right'] as const) {
      const m = monitored[side]
      if (m.status === 'lost') {
        // Gone for longer than the grace period: forget smoothing/velocity history so a returning hand starts clean.
        this.filters[side].reset()
        this.kin[side].reset()
      }
      out[side] = m.hand ? { ...m.hand, status: m.status === 'holding' ? 'holding' : 'tracking' } : null
    }

    return { timestampMs: nowMs, source, left: out.left, right: out.right, detections, tracking: this.monitor.snapshot(nowMs) }
  }

  /**
   * Detector glitches (a hand briefly mistaken for something else, a re-detection with a different box) appear as ONE frame
   * in which the palm jumps several hand-sizes and then comes back. A real stroke moves at most ~1 hand-size per frame
   * even at 12 fps, so a jump beyond what any hand could do in that time is held back for one frame: if the next frame
   * confirms the new place it is accepted (the hand really went there, or was re-acquired), otherwise it is dropped and the
   * hand is treated as momentarily missed (the loss-handling then holds the last pose). Without this, one bad frame
   * becomes a phantom stroke.
   */
  private isGlitch(side: Side, palm: { x: number; y: number }, size: number, nowMs: number): boolean {
    const last = this.lastRaw[side]
    const accept = () => {
      this.lastRaw[side] = { palm, size, t: nowMs }
      this.pending[side] = null
      return false
    }
    if (!last || nowMs - last.t > 400) return accept()
    const hs = Math.max(0.03, last.size)
    const dt = Math.max(0.001, (nowMs - last.t) / 1000)
    const jump = Math.hypot(palm.x - last.palm.x, palm.y - last.palm.y) / hs
    if (jump <= 1.2 + 14 * dt) return accept()
    const p = this.pending[side]
    if (p && Math.hypot(palm.x - p.x, palm.y - p.y) / hs < 1) return accept() // confirmed by a second frame
    this.pending[side] = palm
    return true
  }

  reset() {
    this.lastRaw = { left: null, right: null }
    this.pending = { left: null, right: null }
    for (const s of ['left', 'right'] as const) {
      this.filters[s].reset()
      this.kin[s].reset()
    }
    this.monitor.reset()
    this.identity.reset()
  }
}

export { effectiveHandedness }
