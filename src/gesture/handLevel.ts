import type { DynamicsConfig } from '@/config/gestureConfig'

/** Vertical movement range of a hand, from calibration (display space; smaller y = higher on screen). */
export interface VerticalRange {
  /** Palm y when the hand is as HIGH as the user comfortably goes. */
  highY: number
  /** Palm y when as LOW as the user comfortably goes. */
  lowY: number
}

const MIN_SPAN = 0.08

/**
 * Normalised hand height, 0 (low) … 1 (high). Uses the user's calibrated range when it is usable, otherwise a fixed
 * fallback range, so dynamics and cues work before calibration but are better after it.
 */
export function handLevel(palmY: number, range: VerticalRange | null, cfg: Pick<DynamicsConfig, 'fallbackHighY' | 'fallbackLowY'>): number {
  const usable = range && range.lowY - range.highY >= MIN_SPAN
  const high = usable ? range.highY : cfg.fallbackHighY
  const low = usable ? range.lowY : cfg.fallbackLowY
  const v = (low - palmY) / (low - high)
  return Math.max(0, Math.min(1, v))
}
