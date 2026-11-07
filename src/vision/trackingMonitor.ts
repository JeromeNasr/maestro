import type { HandStatus, Side, SideTracking, TrackingSnapshot } from './types'

interface Slot<T> {
  last: T | null
  lastSeenMs: number
  confidence: number
  history: boolean[]
}

export interface MonitorOptions {
  /** Keep a missing hand's last pose for this long (ms) before declaring it lost. */
  graceMs: () => number
  /** Frames in the rolling presence/reliability window. */
  windowFrames: number
  /** Smoothing for the confidence readout (0–1, higher = more responsive). */
  confidenceSmoothing: number
}

export interface MonitoredHand<T> {
  hand: T | null
  status: HandStatus
}

/**
 * Temporary tracking-loss handling and confidence/reliability bookkeeping.
 *  tracking → (missed) → holding (≤ grace) → lost.
 * While 'holding', the last known hand is returned so downstream code does not flicker; after the grace period
 * it is dropped and the pipeline resets that hand's filters/kinematics.
 */
export class TrackingMonitor<T extends { confidence: number }> {
  private slots: Record<Side, Slot<T>> = { left: this.fresh(), right: this.fresh() }
  private anyHistory: boolean[] = []

  constructor(private opts: MonitorOptions) {}

  private fresh(): Slot<T> {
    return { last: null, lastSeenMs: -Infinity, confidence: 0, history: [] }
  }

  private push(arr: boolean[], v: boolean) {
    arr.push(v)
    if (arr.length > this.opts.windowFrames) arr.shift()
  }

  /** `observed` hands carry the raw per-frame score in `confidence`; the monitor replaces it with the smoothed value. */
  update(nowMs: number, observed: Record<Side, T | null>) {
    const result = {} as Record<Side, MonitoredHand<T>>
    const sides: Side[] = ['left', 'right']
    for (const side of sides) {
      const slot = this.slots[side]
      const obs = observed[side]
      this.push(slot.history, obs !== null)
      if (obs) {
        const k = this.opts.confidenceSmoothing
        slot.confidence = slot.lastSeenMs === -Infinity || nowMs - slot.lastSeenMs > this.opts.graceMs() ? obs.confidence : slot.confidence + k * (obs.confidence - slot.confidence)
        slot.lastSeenMs = nowMs
        slot.last = { ...obs, confidence: slot.confidence }
        result[side] = { hand: slot.last, status: 'tracking' }
      } else if (slot.last && nowMs - slot.lastSeenMs <= this.opts.graceMs()) {
        result[side] = { hand: slot.last, status: 'holding' }
      } else {
        slot.last = null
        slot.confidence = 0
        result[side] = { hand: null, status: 'lost' }
      }
    }
    this.push(this.anyHistory, observed.left !== null || observed.right !== null)
    return result
  }

  snapshot(nowMs: number): TrackingSnapshot {
    const side = (s: Side): SideTracking => {
      const slot = this.slots[s]
      const seenNow = slot.history.at(-1) === true
      const held = !seenNow && slot.last !== null && nowMs - slot.lastSeenMs <= this.opts.graceMs()
      return {
        status: seenNow ? 'tracking' : held ? 'holding' : 'lost',
        confidence: slot.last ? slot.confidence : 0,
        lostForMs: seenNow || slot.lastSeenMs === -Infinity ? 0 : nowMs - slot.lastSeenMs,
        presence: ratio(slot.history),
      }
    }
    const l = side('left')
    const r = side('right')
    const visible = [l, r].filter((s) => s.status === 'tracking')
    return {
      left: l,
      right: r,
      confidence: visible.length ? visible.reduce((a, s) => a + s.confidence, 0) / visible.length : 0,
      reliability: ratio(this.anyHistory),
    }
  }

  reset() {
    this.slots = { left: this.fresh(), right: this.fresh() }
    this.anyHistory = []
  }
}

const ratio = (a: boolean[]) => (a.length ? a.filter(Boolean).length / a.length : 0)
