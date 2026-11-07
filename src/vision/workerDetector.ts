import { CDN_ASSETS, resolveAssets } from './assetLoader'
import type { DetectorFactory, DetectorOptions, HandDetector } from './detector'
import type { FromWorker, ToWorker } from './detectorProtocol'
import type { DetectionResult } from './types'

const INIT_TIMEOUT_MS = 60_000
const ALLOWED_ORIGINS = [new URL(CDN_ASSETS.wasmBase).origin, new URL(CDN_ASSETS.modelUrl).origin]

interface Pending { resolve: (r: DetectionResult) => void; reject: (e: Error) => void }

/** HandDetector backed by a Web Worker: inference never blocks the main thread. `detect()` is asynchronous. */
export class WorkerHandDetector implements HandDetector {
  private seq = 0
  private pending = new Map<number, Pending>()
  private closed = false

  private constructor(
    private worker: Worker,
    readonly delegate: 'GPU' | 'CPU',
    readonly assetOrigin: 'local' | 'cdn',
  ) {
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data)
    worker.onerror = (e) => this.failAll(new Error(e.message || 'The hand-detection worker crashed'))
    worker.onmessageerror = () => this.failAll(new Error('The hand-detection worker sent an unreadable message'))
  }

  static async create(opts: DetectorOptions, make: () => Worker = () =>
      // MediaPipe's WASM loader needs importScripts(), which only CLASSIC workers have (production build, bundled as IIFE).
      // Vite's dev server can only serve module workers; there the worker fails to start and MAESTRO falls back to the main thread.
      import.meta.env.DEV
        ? new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' })
        : new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'classic' })): Promise<WorkerHandDetector> {
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('Web Workers or ImageBitmap are not available')
    const assets = await resolveAssets(undefined, import.meta.env.BASE_URL)
    const worker = make()
    try {
      const ready = await new Promise<Extract<FromWorker, { type: 'ready' }>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The hand-detection worker did not start in time')), INIT_TIMEOUT_MS)
        worker.onmessage = (e: MessageEvent<FromWorker>) => {
          if (e.data.type === 'ready') {
            clearTimeout(timer)
            resolve(e.data)
          } else if (e.data.type === 'error') {
            clearTimeout(timer)
            reject(new Error(e.data.message))
          }
        }
        worker.onerror = (e) => {
          clearTimeout(timer)
          reject(new Error(e.message || 'The hand-detection worker failed to load'))
        }
        const init: ToWorker = { type: 'init', minConfidence: opts.minConfidence, delegate: opts.delegate ?? 'auto', assets, allowedOrigins: ALLOWED_ORIGINS }
        worker.postMessage(init)
      })
      return new WorkerHandDetector(worker, ready.delegate, assets.origin)
    } catch (e) {
      worker.terminate()
      throw e
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): Promise<DetectionResult> {
    if (this.closed) return Promise.reject(new Error('Detector closed'))
    return createImageBitmap(video).then(
      (bitmap) =>
        new Promise<DetectionResult>((resolve, reject) => {
          if (this.closed) {
            bitmap.close()
            return reject(new Error('Detector closed'))
          }
          const id = ++this.seq
          this.pending.set(id, { resolve, reject })
          const msg: ToWorker = { type: 'detect', id, bitmap, ts: timestampMs }
          this.worker.postMessage(msg, [bitmap])
        }),
    )
  }

  setMinConfidence(c: number) {
    if (!this.closed) this.worker.postMessage({ type: 'setMinConfidence', value: c } satisfies ToWorker)
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.worker.postMessage({ type: 'close' } satisfies ToWorker)
    this.worker.terminate()
    this.failAll(new Error('Detector closed'))
  }

  private onMessage(m: FromWorker) {
    if (m.type === 'result') {
      const p = this.pending.get(m.id)
      this.pending.delete(m.id)
      p?.resolve(m.result)
    } else if (m.type === 'error') {
      if (m.id !== undefined) {
        const p = this.pending.get(m.id)
        this.pending.delete(m.id)
        p?.reject(new Error(m.message))
      }
    }
  }

  private failAll(e: Error) {
    for (const p of this.pending.values()) p.reject(e)
    this.pending.clear()
  }
}

/** Prefer the worker; fall back to `fallback` (main-thread MediaPipe) if workers are unsupported or fail to start. */
export function withFallback(primary: DetectorFactory, fallback: DetectorFactory): DetectorFactory {
  return async (opts) => {
    try {
      return await primary(opts)
    } catch (e) {
      // Not silent: the reason is logged, and hand tracking continues on the main thread.
      console.warn('MAESTRO: hand detection could not start in a Web Worker; using the main thread instead.', e)
      return fallback(opts)
    }
  }
}
