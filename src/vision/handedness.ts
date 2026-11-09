import type { TrackingConfig } from '@/config/gestureConfig'
import type { LabelSource, ReportedLabel, Side, Vec2 } from './types'

/**
 * How reported labels map to the user's hands.
 *
 * MediaPipe documents that handedness is computed assuming a MIRRORED (selfie) image and that applications feeding
 * an un-mirrored frame must swap the labels. MAESTRO feeds the detector the raw frame (display mirroring happens
 * afterwards), so the documented default is swap = true. That default is still only a default: it is marked
 * unverified, the identity tracker double-checks it online (two separated hands must agree with their position) and
 * calibration measures it against the mirrored preview.
 */
export interface HandednessResolution {
  /** Swap reported Left↔Right. */
  swap: boolean
  /** True once validated by calibration, or explicitly forced by the user. */
  verified: boolean
  origin: 'calibration' | 'user-as-reported' | 'user-swapped' | 'unverified-default' | 'demo'
}

export interface CalibratedHandedness { swap: boolean }

export function effectiveHandedness(mode: TrackingConfig['handednessMode'], calibrated: CalibratedHandedness | null): HandednessResolution {
  if (mode === 'as-reported') return { swap: false, verified: true, origin: 'user-as-reported' }
  if (mode === 'swapped') return { swap: true, verified: true, origin: 'user-swapped' }
  if (calibrated) return { swap: calibrated.swap, verified: true, origin: 'calibration' }
  return { swap: true, verified: false, origin: 'unverified-default' }
}

export interface SideCandidate {
  label: ReportedLabel
  score: number
  /** Palm centre in display space. */
  palm: Vec2
}

export interface SideAssignment<T extends SideCandidate> {
  left: { candidate: T; source: LabelSource } | null
  right: { candidate: T; source: LabelSource } | null
}

const labelToSide = (label: ReportedLabel, swap: boolean): Side => {
  const s: Side = label === 'Left' ? 'left' : 'right'
  return swap ? (s === 'left' ? 'right' : 'left') : s
}

/**
 * Assigns detections to the user's left/right hand.
 * - One hand: trust the (resolved) label.
 * - Two hands that resolve to the SAME side are a labelling error (it happens); use position in the mirrored
 *   preview instead: the hand further left on screen is the user's left. At most two hands are kept (highest score).
 */
export function resolveSides<T extends SideCandidate>(candidates: readonly T[], res: HandednessResolution): SideAssignment<T> {
  const out: SideAssignment<T> = { left: null, right: null }
  const top = [...candidates].sort((a, b) => b.score - a.score).slice(0, 2)
  const source: LabelSource = res.swap ? 'swapped' : 'reported'
  if (top.length === 1) {
    const side = labelToSide(top[0].label, res.swap)
    out[side] = { candidate: top[0], source }
  } else if (top.length === 2) {
    const [a, b] = top
    if (labelToSide(a.label, res.swap) !== labelToSide(b.label, res.swap)) {
      out[labelToSide(a.label, res.swap)] = { candidate: a, source }
      out[labelToSide(b.label, res.swap)] = { candidate: b, source }
    } else {
      const [leftC, rightC] = a.palm.x <= b.palm.x ? [a, b] : [b, a]
      out.left = { candidate: leftC, source: 'positional' }
      out.right = { candidate: rightC, source: 'positional' }
    }
  }
  return out
}
