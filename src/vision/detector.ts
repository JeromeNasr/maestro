import type { DetectionResult } from './types'

/** Abstraction over the hand-landmark model so the pipeline/session can be tested with a fake. */
export interface HandDetector {
  readonly delegate: 'GPU' | 'CPU'
  readonly assetOrigin: 'local' | 'cdn' | 'test'
  /**
   * Inference on the current video frame. `timestampMs` must increase strictly. Synchronous for the main-thread
   * detector, asynchronous for the worker-backed one (the session keeps at most one frame in flight).
   */
  detect(video: HTMLVideoElement, timestampMs: number): DetectionResult | Promise<DetectionResult>
  /** Minimum hand detection/presence/tracking confidence (0–1). Applied live. */
  setMinConfidence(c: number): void
  close(): void
}

export interface DetectorOptions {
  minConfidence: number
  /** 'auto' (default) tries the GPU delegate first and falls back to the CPU (WASM) delegate. */
  delegate?: 'auto' | 'GPU' | 'CPU'
}
export type DetectorFactory = (opts: DetectorOptions) => Promise<HandDetector>
