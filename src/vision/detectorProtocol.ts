import type { DetectorOptions } from './detector'
import type { DetectionResult } from './types'
import type { AssetLocation } from './assetLoader'

/** Messages between the main thread and the hand-detection worker. */
export type ToWorker =
  | { type: 'init'; minConfidence: number; delegate: NonNullable<DetectorOptions['delegate']>; assets: AssetLocation; allowedOrigins: string[] }
  | { type: 'detect'; id: number; bitmap: ImageBitmap; ts: number }
  | { type: 'setMinConfidence'; value: number }
  | { type: 'close' }

export type FromWorker =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'error'; message: string; id?: number }
  | { type: 'result'; id: number; result: DetectionResult }

/**
 * Network egress guard for the worker. A <meta> Content-Security-Policy does NOT apply to workers, and MediaPipe tries
 * to send a small usage-log request, so the worker itself refuses any request to an origin that is not on the
 * allow-list (its own origin and the two documented CDN fallbacks).
 */
export function isAllowedUrl(url: string, selfOrigin: string, allowedOrigins: readonly string[]): boolean {
  try {
    const u = new URL(url, selfOrigin)
    if (u.protocol === 'blob:' || u.protocol === 'data:') return true
    return u.origin === selfOrigin || allowedOrigins.includes(u.origin)
  } catch {
    return false
  }
}

/**
 * One user-facing confidence becomes three MediaPipe thresholds. They were all equal (0.6, stricter than MediaPipe's own
 * 0.5 defaults), which makes a hand that is blurred by a quick movement fail the TRACKING check, so it is dropped and has
 * to be found again from scratch. Detection (finding a hand from nothing) stays fairly strict to avoid phantom hands;
 * presence and tracking are deliberately more forgiving so a fast hand is followed instead of lost.
 */
export function confidenceTriplet(c: number): { detection: number; presence: number; tracking: number } {
  const clamp = (v: number) => Math.min(0.9, Math.max(0.1, v))
  return { detection: clamp(c * 0.85), presence: clamp(c * 0.65), tracking: clamp(c * 0.5) }
}
