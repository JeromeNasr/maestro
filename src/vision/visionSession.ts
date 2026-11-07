import { DEFAULT_GESTURE_CONFIG, type GestureConfig, type TimeSignature } from '@/config/gestureConfig'
import { gestureSettings } from '@/config/settings'
import { createStore, type Store } from '@/lib/store'
import { CameraController } from './camera'
import { cameraErrorInfo, classifyCameraError, type CameraErrorInfo } from './cameraErrors'
import { CalibrationSession, calibrationStore, IDLE_CALIBRATION, type CalibrationState } from './calibration'
import { DemoSource, type DemoOptions } from './demoSource'
import type { DetectorFactory, HandDetector } from './detector'
import { clamp } from './geometry'
import { HandPipeline } from './handPipeline'
import { effectiveHandedness, type HandednessResolution } from './handedness'
import type { FrameSource, HandFrame, SideTracking } from './types'

export type VisionStatus = 'idle' | 'requesting-permission' | 'loading-model' | 'running' | 'paused' | 'error'

export interface VisionSnapshot {
  status: VisionStatus
  source: FrameSource | null
  error: CameraErrorInfo | null
  delegate: 'GPU' | 'CPU' | null
  /** Set when MAESTRO changed delegate automatically (shown to the user). */
  delegateNote: string | null
  assetOrigin: 'local' | 'cdn' | 'test' | null
  videoSize: { width: number; height: number } | null
  /** Measured processing rate (frames/s) and mean inference time (ms). */
  fps: number
  inferenceMs: number
  left: SideTracking
  right: SideTracking
  confidence: number
  reliability: number
  handedness: HandednessResolution
  calibration: CalibrationState
}

export interface FrameScheduler {
  request(cb: (t: number) => void): number
  cancel(id: number): void
}

export interface VisionSessionDeps {
  createDetector: DetectorFactory
  camera?: CameraController
  scheduler?: FrameScheduler
  now?: () => number
  getConfig?: () => GestureConfig
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener'> & { hidden: boolean }
}

const NO_SIDE: SideTracking = { status: 'lost', confidence: 0, lostForMs: 0, presence: 0 }

export const IDLE_SNAPSHOT: VisionSnapshot = {
  status: 'idle', source: null, error: null, delegate: null, delegateNote: null, assetOrigin: null, videoSize: null, fps: 0, inferenceMs: 0,
  left: NO_SIDE, right: NO_SIDE, confidence: 0, reliability: 0,
  handedness: { swap: false, verified: false, origin: 'unverified-default' }, calibration: IDLE_CALIBRATION,
}
const DEMO_SIZE = { width: 640, height: 480 }
const UI_INTERVAL_MS = 100
/** If the GPU delegate averages slower than this per frame (software GL, weak iGPU), switch once to the CPU delegate. */
export const SLOW_GPU_MS = 80
const SLOW_GPU_MIN_SAMPLES = 15

/** The detector's minimum confidence implied by the user's sensitivity slider (higher sensitivity → lower threshold). */
export const effectiveMinConfidence = (cfg: GestureConfig) => clamp(cfg.tracking.minDetectionConfidence / cfg.tracking.sensitivity, 0.2, 0.95)

/**
 * Owns everything with a lifecycle in the vision pipeline: camera stream, detector, frame loop, visibility
 * listener, calibration. React only *subscribes* (store + onFrame); it never drives the pipeline per frame.
 * Nothing is requested at construction; the camera is requested only by `startCamera()`.
 */
export class VisionSession {
  readonly store: Store<VisionSnapshot>
  private camera: CameraController
  private scheduler: FrameScheduler
  private now: () => number
  private getConfig: () => GestureConfig
  private doc: NonNullable<VisionSessionDeps['doc']> | null

  private video: HTMLVideoElement | null = null
  private detector: HandDetector | null = null
  private pipeline: HandPipeline
  private demo: DemoSource | null = null
  private demoStart = 0
  private calibration: CalibrationSession | null = null
  private frameListeners = new Set<(f: HandFrame | null) => void>()

  private gen = 0
  private rafId: number | null = null
  private lastVideoTime = -1
  private lastTs = 0
  private lastProcessed = 0
  private fps = 0
  private inferenceMs = 0
  private lastUi = 0
  private inferenceSamples = 0
  private delegateSwitchTried = false
  private unsubSettings: (() => void) | null = null
  private visibilityHandler: (() => void) | null = null
  private disposed = false

  constructor(private deps: VisionSessionDeps) {
    this.camera = deps.camera ?? new CameraController()
    this.scheduler = deps.scheduler ?? { request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) }
    this.now = deps.now ?? (() => performance.now())
    this.getConfig = deps.getConfig ?? (() => gestureSettings.get() ?? DEFAULT_GESTURE_CONFIG)
    this.doc = deps.doc ?? (typeof document !== 'undefined' ? document : null)
    this.pipeline = new HandPipeline({ getConfig: this.getConfig, getHandedness: () => this.handedness() })
    this.store = createStore<VisionSnapshot>({ ...IDLE_SNAPSHOT, handedness: this.handedness() })
    this.subscribeSettings()
  }

  /** Live sensitivity changes → detector thresholds; a manual left/right override shows immediately, even while idle. */
  private subscribeSettings() {
    if (this.unsubSettings || this.disposed) return
    this.unsubSettings = gestureSettings.subscribe(() => {
      this.detector?.setMinConfidence(effectiveMinConfidence(this.getConfig()))
      this.patch({ handedness: this.handedness() })
    })
  }

  // ───────────────────────── public API ─────────────────────────

  attachVideo(el: HTMLVideoElement | null) {
    this.video = el
  }

  /** Subscribe to every processed frame (used by the canvas overlay). `null` = cleared (stopped). */
  onFrame(cb: (f: HandFrame | null) => void): () => void {
    this.frameListeners.add(cb)
    return () => this.frameListeners.delete(cb)
  }

  /** Request camera permission and start real hand tracking. Must be called from an explicit user action. */
  async startCamera(): Promise<void> {
    if (this.disposed || !this.video) return
    this.subscribeSettings()
    const s = this.store.get().status
    if (s === 'requesting-permission' || s === 'loading-model' || s === 'running' || s === 'paused') return
    this.teardown()
    const gen = ++this.gen
    const video = this.video
    this.patch({ status: 'requesting-permission', source: 'camera', error: null, delegateNote: null })

    // Load the model while the permission prompt is open; discard it if the camera fails.
    const detectorP = this.deps.createDetector({ minConfidence: effectiveMinConfidence(this.getConfig()) })
    detectorP.catch(() => undefined)
    const discard = () => void detectorP.then((d) => d.close()).catch(() => undefined)

    let size: { width: number; height: number }
    try {
      const info = await this.camera.start(video, () => this.onTrackEnded(gen))
      size = { width: info.width, height: info.height }
    } catch (e) {
      discard()
      if (gen !== this.gen) return
      this.fail(classifyCameraError(e))
      return
    }
    if (gen !== this.gen) return discard()

    this.patch({ status: 'loading-model', videoSize: size })
    let detector: HandDetector
    try {
      detector = await detectorP
    } catch {
      if (gen !== this.gen) return
      this.camera.stop() // never leave the camera on without tracking
      this.fail({ kind: 'unknown', title: 'Hand-tracking model failed to load', message: 'The MediaPipe hand model or runtime could not be loaded (neither the local copy nor the CDN fallback). Check your connection, reload, or use demonstration mode.', canRetry: true })
      return
    }
    if (gen !== this.gen) return detector.close()

    this.detector = detector
    this.pipeline.reset()
    this.lastVideoTime = -1
    this.lastTs = 0
    this.lastProcessed = 0
    this.inferenceSamples = 0
    this.inferenceMs = 0
    this.delegateSwitchTried = false
    this.attachVisibility()
    this.patch({ status: 'running', delegate: detector.delegate, assetOrigin: detector.assetOrigin })
    this.schedule()
  }

  /** Start the synthetic demonstration (no camera, no model). */
  startDemo(opts: Partial<DemoOptions> = {}) {
    if (this.disposed) return
    this.subscribeSettings()
    const s = this.store.get().status
    if (s === 'requesting-permission' || s === 'loading-model') return
    this.teardown()
    ++this.gen
    this.demo = new DemoSource(opts)
    this.demoStart = this.now()
    this.pipeline.reset()
    this.lastProcessed = 0
    this.attachVisibility()
    this.patch({ status: 'running', source: 'demo', error: null, videoSize: DEMO_SIZE, delegate: null, assetOrigin: null })
    this.schedule()
  }

  /** Live controls of the synthetic conductor (demonstration mode only). */
  setDemoBpm(bpm: number) {
    this.demo?.setBpm(bpm)
  }
  setDemoLeftLevel(level: number | 'wave') {
    this.demo?.setLeftLevel(level)
  }
  setDemoTimeSignature(ts: TimeSignature) {
    this.demo?.setTimeSignature(ts)
  }

  /** Stop camera/demo and release everything. Idempotent. */
  stop() {
    this.gen++
    this.teardown()
    this.emit(null)
    this.patch({
      status: 'idle', source: null, error: null, delegate: null, delegateNote: null, assetOrigin: null, videoSize: null,
      fps: 0, inferenceMs: 0, left: NO_SIDE, right: NO_SIDE, confidence: 0, reliability: 0, calibration: IDLE_CALIBRATION,
    })
  }

  /**
   * Stop everything and detach from global settings, but stay reusable (used when the Studio unmounts; React StrictMode
   * mounts → unmounts → mounts again). Unlike dispose() the session can be started again afterwards.
   */
  release() {
    this.stop()
    this.unsubSettings?.()
    this.unsubSettings = null
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.gen++
    this.teardown()
    this.unsubSettings?.()
    this.unsubSettings = null
    this.frameListeners.clear()
  }

  startCalibration() {
    const s = this.store.get()
    if (s.status !== 'running' || s.source !== 'camera') return
    this.calibration = new CalibrationSession(this.getConfig().calibration)
    this.calibration.start(this.now())
    this.patch({ calibration: this.calibration.state })
  }

  /** Cancel an active calibration, or dismiss a finished/failed one. */
  cancelCalibration() {
    this.calibration?.cancel()
    this.calibration = null
    this.patch({ calibration: IDLE_CALIBRATION, handedness: this.handedness() })
  }

  clearCalibration() {
    calibrationStore.set(null)
    this.patch({ handedness: this.handedness() })
  }

  // ───────────────────────── internals ─────────────────────────

  private handedness(): HandednessResolution {
    const prov = this.calibration?.active ? this.calibration.provisionalSwap : null
    if (prov !== null && prov !== undefined) return { swap: prov, verified: true, origin: 'calibration' }
    return effectiveHandedness(this.getConfig().tracking.handednessMode, calibrationStore.get()?.handedness ?? null)
  }

  private patch(p: Partial<VisionSnapshot>) {
    this.store.set((prev) => ({ ...prev, ...p }))
  }

  private emit(f: HandFrame | null) {
    this.frameListeners.forEach((cb) => cb(f))
  }

  private schedule() {
    if (this.rafId === null) this.rafId = this.scheduler.request(this.loop)
  }

  private loop = () => {
    this.rafId = null
    if (this.store.get().status !== 'running') return
    this.runFrame()
    if (this.store.get().status === 'running') this.schedule()
  }

  private runFrame() {
    const now = this.now()
    let result
    let inference = 0
    const source = this.store.get().source!
    if (source === 'camera') {
      const v = this.video
      if (!v || !this.detector || v.readyState < 2 || v.currentTime === this.lastVideoTime) return // no new frame yet
      this.lastVideoTime = v.currentTime
      const ts = Math.max(now, this.lastTs + 1) // MediaPipe requires strictly increasing timestamps
      this.lastTs = ts
      try {
        result = this.detector.detect(v, ts)
      } catch {
        this.teardown()
        this.fail({ kind: 'unknown', title: 'Hand tracking stopped', message: 'The hand-tracking model reported an error and was stopped. Press Enable camera to try again.', canRetry: true })
        return
      }
      inference = this.now() - now
    } else {
      result = this.demo!.detect(now - this.demoStart)
    }

    const frame = this.pipeline.process(result, now, source)

    // Calibration consumes the same frames.
    if (this.calibration?.active) {
      const before = this.calibration.state.step
      const st = this.calibration.update(frame, now)
      if (st.step === 'complete' && st.profile) calibrationStore.set(st.profile)
      if (st.step !== before || st.step === 'idle') this.patch({ calibration: st, handedness: this.handedness() })
      else this.patch({ calibration: st })
    }
    this.emit(frame)

    // Measured rates (smoothed).
    if (this.lastProcessed) {
      const dt = now - this.lastProcessed
      if (dt > 0) this.fps = this.fps ? this.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt
    }
    this.lastProcessed = now
    if (inference > 0) {
      this.inferenceMs = this.inferenceMs ? this.inferenceMs * 0.9 + inference * 0.1 : inference
      this.inferenceSamples++
      this.maybeDowngradeDelegate()
    }

    if (now - this.lastUi >= UI_INTERVAL_MS) {
      this.lastUi = now
      this.patch({
        left: frame.tracking.left, right: frame.tracking.right, confidence: frame.tracking.confidence,
        reliability: frame.tracking.reliability, fps: this.fps, inferenceMs: this.inferenceMs, handedness: this.handedness(),
      })
    }
  }

  /** One-shot: a persistently slow GPU delegate is replaced by the CPU delegate. Keeps running meanwhile. */
  private maybeDowngradeDelegate() {
    const d = this.detector
    if (!d || d.delegate !== 'GPU' || this.delegateSwitchTried || this.inferenceSamples < SLOW_GPU_MIN_SAMPLES || this.inferenceMs <= SLOW_GPU_MS) return
    this.delegateSwitchTried = true
    const gen = this.gen
    this.deps
      .createDetector({ minConfidence: effectiveMinConfidence(this.getConfig()), delegate: 'CPU' })
      .then((cpu) => {
        if (gen !== this.gen || this.detector !== d) return cpu.close() // stopped or replaced meanwhile
        this.detector = cpu
        d.close()
        this.inferenceMs = 0
        this.inferenceSamples = 0
        this.patch({ delegate: cpu.delegate, delegateNote: `Switched to the CPU delegate because the GPU delegate was slow (${Math.round(this.store.get().inferenceMs)} ms/frame).` })
      })
      .catch(() => undefined) // keep the working GPU detector
  }

  private fail(info: CameraErrorInfo) {
    this.teardown()
    this.emit(null)
    this.patch({ status: 'error', error: info, delegate: null, assetOrigin: null, left: NO_SIDE, right: NO_SIDE, confidence: 0, calibration: IDLE_CALIBRATION })
  }

  private onTrackEnded(gen: number) {
    if (gen !== this.gen || this.disposed) return
    this.fail({ ...cameraErrorInfo('no-device'), title: 'Camera disconnected', message: 'The camera stopped providing video (it may have been unplugged or taken by another app). Reconnect it and press Enable camera, or use demonstration mode.' })
  }

  private attachVisibility() {
    if (!this.doc || this.visibilityHandler) return
    this.visibilityHandler = () => {
      const st = this.store.get().status
      if (this.doc!.hidden && st === 'running') {
        // Don't burn CPU/GPU in a background tab.
        if (this.rafId !== null) this.scheduler.cancel(this.rafId)
        this.rafId = null
        this.patch({ status: 'paused' })
      } else if (!this.doc!.hidden && st === 'paused') {
        this.pipeline.reset() // avoid a huge velocity from the time gap
        this.lastProcessed = 0
        this.lastVideoTime = -1
        this.patch({ status: 'running' })
        this.schedule()
      }
    }
    this.doc.addEventListener('visibilitychange', this.visibilityHandler)
  }

  /** Release everything that has a lifecycle (loop, listeners, camera, detector, demo, calibration). */
  private teardown() {
    if (this.rafId !== null) this.scheduler.cancel(this.rafId)
    this.rafId = null
    if (this.visibilityHandler) this.doc?.removeEventListener('visibilitychange', this.visibilityHandler)
    this.visibilityHandler = null
    this.camera.stop()
    this.detector?.close()
    this.detector = null
    this.demo = null
    this.calibration?.cancel()
    this.calibration = null
    this.pipeline.reset()
  }
}
