import type { GestureConfig } from '@/config/gestureConfig'
import { FINGERTIP_INDICES } from './handTopology'
import { handSize, isValidLandmarks, palmCenter, toDisplay } from './geometry'
import { HandKinematics } from './handKinematics'
import { effectiveHandedness, resolveSides, type HandednessResolution, type SideCandidate } from './handedness'
import { LandmarkFilter } from './landmarkFilter'
import { TrackingMonitor } from './trackingMonitor'
import type { DetectionResult, DetectionSummary, FrameSource, HandFrame, Side, TrackedHand } from './types'

interface Candidate extends SideCandidate {
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
        return { label: h.label, score: h.score, palm: palmCenter(landmarks), landmarks }
      })
    const detections: DetectionSummary[] = candidates.map((c) => ({ reportedLabel: c.label, score: c.score, palm: c.palm }))
    const assigned = resolveSides(candidates, res)

    const observed: Record<Side, TrackedHand | null> = { left: null, right: null }
    for (const side of ['left', 'right'] as const) {
      const a = assigned[side]
      if (!a) continue
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

  reset() {
    for (const s of ['left', 'right'] as const) {
      this.filters[s].reset()
      this.kin[s].reset()
    }
    this.monitor.reset()
  }
}

export { effectiveHandedness }
