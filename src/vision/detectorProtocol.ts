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
