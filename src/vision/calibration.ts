import type { CalibrationConfig } from '@/config/gestureConfig'
import { createPersistentStore } from '@/lib/store'
import type { HandFrame, ReportedLabel, Side } from './types'

/**
 * Calibration has two jobs:
 *  1. HANDEDNESS VALIDATION against the mirrored preview. The user shows ONE hand on the matching side of the
 *     preview (their right hand appears on the right of a mirror view). Because the user physically places the hand
 *     where it must appear, the preview itself is the ground truth: we compare it with the label the detector
 *     reports and only then decide whether a Left↔Right swap is needed.
 *  2. RANGE CAPTURE: the comfortable movement range and hand size per hand, used later for dynamics and beat scaling.
 */
export type CalibrationStep = 'idle' | 'handedness-right' | 'handedness-left' | 'range' | 'complete' | 'failed'

export interface HandRange {
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Median hand size (wrist→middle-finger base), normalised. */
  handSize: number
  samples: number
}

export interface CalibrationProfile {
  version: 1
  createdAt: number
  handedness: {
    /** True if the detector's labels must be swapped to match the user's hands. */
    swap: boolean
    /** Majority label the detector reported for the user's RIGHT / LEFT hand. */
    observed: { right: ReportedLabel; left: ReportedLabel }
    /** Fraction of samples agreeing with that majority. */
    agreement: { right: number; left: number }
  }
  ranges: { left: HandRange | null; right: HandRange | null }
  warnings: string[]
}

export interface CalibrationState {
  step: CalibrationStep
  /** 0–1 progress within the current step. */
  progress: number
  title: string
  instruction: string
  hint: string | null
  failure: string | null
  profile: CalibrationProfile | null
}

export const IDLE_CALIBRATION: CalibrationState = { step: 'idle', progress: 0, title: '', instruction: '', hint: null, failure: null, profile: null }

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]

function majority(labels: ReportedLabel[]): { label: ReportedLabel; agreement: number } {
  const left = labels.filter((l) => l === 'Left').length
  const label: ReportedLabel = left * 2 > labels.length ? 'Left' : 'Right'
  return { label, agreement: Math.max(left, labels.length - left) / labels.length }
}

export class CalibrationSession {
  private _state: CalibrationState = IDLE_CALIBRATION
  private stepStart = 0
  private samples: ReportedLabel[] = []
  private observed: { right?: { label: ReportedLabel; agreement: number }; left?: { label: ReportedLabel; agreement: number } } = {}
  private rangeSamples: Record<Side, { x: number; y: number; size: number }[]> = { left: [], right: [] }
  /** Known after both handedness steps; lets the pipeline apply the result during the range step. */
  provisionalSwap: boolean | null = null

  constructor(private cfg: CalibrationConfig) {}

  get state(): CalibrationState {
    return this._state
  }
  get active(): boolean {
    return this._state.step !== 'idle' && this._state.step !== 'complete' && this._state.step !== 'failed'
  }

  start(nowMs: number) {
    this.observed = {}
    this.provisionalSwap = null
    this.rangeSamples = { left: [], right: [] }
    this.enter('handedness-right', nowMs)
  }

  cancel() {
    this.provisionalSwap = null
    this._state = IDLE_CALIBRATION
  }

  /** Feed every processed frame while active. Returns the updated state. */
  update(frame: HandFrame, nowMs: number): CalibrationState {
    if (!this.active) return this._state
    if (nowMs - this.stepStart > this.cfg.stepTimeoutMs) {
      return this.fail('This step timed out. Make sure your hand is well lit and fully in view, then try again.')
    }
    switch (this._state.step) {
      case 'handedness-right':
        return this.handednessStep(frame, nowMs, 'right')
      case 'handedness-left':
        return this.handednessStep(frame, nowMs, 'left')
      case 'range':
        return this.rangeStep(frame, nowMs)
      default:
        return this._state
    }
  }

  private enter(step: CalibrationStep, nowMs: number) {
    this.stepStart = nowMs
    this.samples = []
    const copy: Record<string, { title: string; instruction: string }> = {
      'handedness-right': {
        title: 'Step 1 of 3 · Right hand',
        instruction: 'Raise ONLY your right hand, on the right side of the preview. The preview is a mirror, so it should appear on the right. Keep it open and still.',
      },
      'handedness-left': {
        title: 'Step 2 of 3 · Left hand',
        instruction: 'Now lower your right hand and raise ONLY your left hand, on the left side of the preview. Keep it open and still.',
      },
      range: {
        title: 'Step 3 of 3 · Range',
        instruction: 'Move both hands slowly through your full comfortable range: high, low, left and right, as if conducting a large orchestra.',
      },
    }
    this._state = { step, progress: 0, hint: null, failure: null, profile: null, ...copy[step] }
  }

  private fail(message: string): CalibrationState {
    this.provisionalSwap = null
    this._state = { ...IDLE_CALIBRATION, step: 'failed', title: 'Calibration did not finish', failure: message }
    return this._state
  }

  private handednessStep(frame: HandFrame, nowMs: number, which: Side): CalibrationState {
    const n = frame.detections.length
    let hint: string | null = null
    if (n === 0) hint = `No hand detected — raise your ${which} hand.`
    else if (n > 1) hint = `Show only your ${which} hand; lower the other one.`
    else {
      const d = frame.detections[0]
      const margin = this.cfg.sideMargin
      const onSide = which === 'right' ? d.palm.x > 0.5 + margin : d.palm.x < 0.5 - margin
      if (!onSide) hint = `Move your ${which} hand to the ${which} side of the preview (the preview is mirrored, like a mirror).`
      else this.samples.push(d.reportedLabel)
    }
    const progress = Math.min(1, this.samples.length / this.cfg.samplesPerHand)
    if (this.samples.length < this.cfg.samplesPerHand) {
      this._state = { ...this._state, progress, hint }
      return this._state
    }
    const m = majority(this.samples)
    if (m.agreement < this.cfg.minLabelAgreement) {
      return this.fail(`The detector's left/right label kept flipping for your ${which} hand (${Math.round(m.agreement * 100)}% consistent). Improve the lighting, keep the hand open and still, and try again.`)
    }
    this.observed[which] = m
    if (which === 'right') {
      this.enter('handedness-left', nowMs)
      return this._state
    }
    const r = this.observed.right!
    const l = this.observed.left!
    if (r.label === l.label) {
      return this.fail(`The detector gave both of your hands the same label (“${r.label}”), so the labels cannot be validated. Try again with each hand clearly separated and well lit.`)
    }
    this.provisionalSwap = r.label === 'Left'
    this.enter('range', nowMs)
    return this._state
  }

  private rangeStep(frame: HandFrame, nowMs: number): CalibrationState {
    for (const side of ['left', 'right'] as const) {
      const h = frame[side]
      if (h && h.status === 'tracking') this.rangeSamples[side].push({ x: h.palm.x, y: h.palm.y, size: h.handSize })
    }
    const elapsed = nowMs - this.stepStart
    const progress = Math.min(1, elapsed / this.cfg.rangeDurationMs)
    const seen = (['left', 'right'] as const).filter((s) => this.rangeSamples[s].length > 0)
    const hint = seen.length === 2 ? null : seen.length === 0 ? 'No hands detected.' : `Only your ${seen[0]} hand is visible — bring the other into view too.`
    if (elapsed < this.cfg.rangeDurationMs) {
      this._state = { ...this._state, progress, hint }
      return this._state
    }
    const warnings: string[] = []
    const ranges = { left: null, right: null } as CalibrationProfile['ranges']
    for (const side of ['left', 'right'] as const) {
      const s = this.rangeSamples[side]
      if (s.length < 10) {
        warnings.push(`${side} hand range was not captured (hand not seen enough).`)
        continue
      }
      const xs = s.map((p) => p.x).sort((a, b) => a - b)
      const ys = s.map((p) => p.y).sort((a, b) => a - b)
      const range: HandRange = { minX: percentile(xs, 0.05), maxX: percentile(xs, 0.95), minY: percentile(ys, 0.05), maxY: percentile(ys, 0.95), handSize: median(s.map((p) => p.size)), samples: s.length }
      if (range.maxX - range.minX < this.cfg.minRangeSpan && range.maxY - range.minY < this.cfg.minRangeSpan) {
        warnings.push(`${side} hand barely moved, so its range was not accepted. Move it more widely.`)
        continue
      }
      ranges[side] = range
    }
    if (!ranges.left && !ranges.right) return this.fail(`No usable hand range was captured. ${warnings.join(' ')}`.trim())
    const o = this.observed
    const profile: CalibrationProfile = {
      version: 1,
      createdAt: Date.now(),
      handedness: {
        swap: this.provisionalSwap === true,
        observed: { right: o.right!.label, left: o.left!.label },
        agreement: { right: o.right!.agreement, left: o.left!.agreement },
      },
      ranges,
      warnings,
    }
    this.provisionalSwap = null
    this._state = { step: 'complete', progress: 1, title: 'Calibration complete', instruction: '', hint: null, failure: null, profile }
    return this._state
  }
}

/** Persisted calibration result (null = never calibrated / cleared). */
export const calibrationStore = createPersistentStore<CalibrationProfile | null>('maestro.calibration.v1', null, (raw) => {
  const p = raw as Partial<CalibrationProfile> | null
  return p && p.version === 1 && typeof p.handedness?.swap === 'boolean' ? (p as CalibrationProfile) : null
})
