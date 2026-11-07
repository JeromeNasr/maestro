import type { CueConfig, DynamicsConfig } from '@/config/gestureConfig'
import { LM } from '@/vision/handTopology'
import type { HandFrame, Landmark, TrackedHand } from '@/vision/types'
import { handLevel, type VerticalRange } from './handLevel'
import type { CueKind, CueProgress } from './types'

export type TransportHint = 'stopped' | 'playing' | 'paused'

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

/** Experimental: all four fingers extended (tip much further from the wrist than its base joint). */
export function isOpenPalm(lm: readonly Landmark[]): boolean {
  const pairs: [number, number][] = [[LM.INDEX_TIP, LM.INDEX_MCP], [LM.MIDDLE_TIP, LM.MIDDLE_MCP], [LM.RING_TIP, LM.RING_MCP], [LM.PINKY_TIP, LM.PINKY_MCP]]
  return pairs.every(([tip, mcp]) => dist(lm[tip], lm[LM.WRIST]) > 1.6 * dist(lm[mcp], lm[LM.WRIST]))
}

const speedInHandSizes = (h: TrackedHand) => (h.handSize > 1e-6 ? h.kinematics.speed / h.handSize : Infinity)

interface CueResult {
  cue: { kind: CueKind; source: 'both-hands' | 'open-palm' } | null
  progress: CueProgress
}

/**
 * Start / stop / pause / resume cues, designed so ordinary conducting cannot trigger them:
 *  - HOLD: the pose must be held, uninterrupted, for startHoldMs / stopHoldMs / pauseHoldMs;
 *  - STILL: BOTH hands must be nearly motionless — a conducting right hand is always moving;
 *  - CONFIDENCE: both hands must be reliably tracked (not "holding" a stale pose);
 *  - STATE: which cue a pose means depends on the transport (raised hands start a stopped piece, pause a playing
 *    one, resume a paused one; lowered hands only stop a piece that is playing or paused);
 *  - LATCH: a cue fires once and the pose must be released before it can fire again.
 * Cues are never globally suppressed while conducting, so stop/pause stay available at all times.
 */
export class CueDetector {
  private poseKey: string | null = null
  private poseStart = 0
  private latched = false

  reset() {
    this.poseKey = null
    this.latched = false
  }

  update(
    frame: HandFrame,
    transport: TransportHint,
    cfg: CueConfig,
    dyn: Pick<DynamicsConfig, 'fallbackHighY' | 'fallbackLowY'>,
    ranges: { left: VerticalRange | null; right: VerticalRange | null },
  ): CueResult {
    const t = frame.timestampMs
    const pose = this.pose(frame, transport, cfg, dyn, ranges)
    if (!pose) {
      this.poseKey = null
      this.latched = false
      return { cue: null, progress: { cue: null, progress: 0 } }
    }
    const key = `${pose.kind}:${pose.source}`
    if (key !== this.poseKey) {
      this.poseKey = key
      this.poseStart = t
      this.latched = false
    }
    const holdMs = pose.kind === 'start' ? cfg.startHoldMs : pose.kind === 'stop' ? cfg.stopHoldMs : cfg.pauseHoldMs
    const progress = Math.min(1, (t - this.poseStart) / holdMs)
    if (this.latched) return { cue: null, progress: { cue: pose.kind, progress: 1 } }
    if (progress >= 1) {
      this.latched = true
      return { cue: pose, progress: { cue: pose.kind, progress: 1 } }
    }
    return { cue: null, progress: { cue: pose.kind, progress } }
  }

  private pose(
    frame: HandFrame,
    transport: TransportHint,
    cfg: CueConfig,
    dyn: Pick<DynamicsConfig, 'fallbackHighY' | 'fallbackLowY'>,
    ranges: { left: VerticalRange | null; right: VerticalRange | null },
  ): { kind: CueKind; source: 'both-hands' | 'open-palm' } | null {
    const l = frame.left
    const r = frame.right
    const reliable = (h: TrackedHand | null): h is TrackedHand => !!h && h.status === 'tracking' && h.confidence >= cfg.minConfidence
    if (reliable(l) && reliable(r) && speedInHandSizes(l) < cfg.stillSpeed && speedInHandSizes(r) < cfg.stillSpeed) {
      const ll = handLevel(l.palm.y, ranges.left, dyn)
      const rl = handLevel(r.palm.y, ranges.right, dyn)
      if (ll >= cfg.raisedLevel && rl >= cfg.raisedLevel) {
        if (transport === 'stopped' && cfg.startCueEnabled) return { kind: 'start', source: 'both-hands' }
        if (transport === 'playing' && cfg.pauseCueEnabled) return { kind: 'pause', source: 'both-hands' }
        if (transport === 'paused' && cfg.pauseCueEnabled) return { kind: 'resume', source: 'both-hands' }
      }
      if (ll <= cfg.loweredLevel && rl <= cfg.loweredLevel && transport !== 'stopped' && cfg.stopCueEnabled) {
        return { kind: 'stop', source: 'both-hands' }
      }
    }
    if (cfg.openPalmPauseEnabled && reliable(r) && speedInHandSizes(r) < cfg.stillSpeed && isOpenPalm(r.landmarks)) {
      if (transport === 'playing') return { kind: 'pause', source: 'open-palm' }
      if (transport === 'paused') return { kind: 'resume', source: 'open-palm' }
    }
    return null
  }
}

