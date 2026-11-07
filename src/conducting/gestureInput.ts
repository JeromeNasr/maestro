import { DEFAULT_GESTURE_CONFIG, type GestureConfig, type TimeSignature } from '@/config/gestureConfig'
import { gestureSettings } from '@/config/settings'
import type { TransportHint } from '@/gesture/cueDetector'
import { GestureEngine } from '@/gesture/gestureEngine'
import type { ConductingEvent, GestureSnapshot } from '@/gesture/types'
import { createStore, type Store } from '@/lib/store'
import { calibrationStore } from '@/vision/calibration'
import type { HandFrame } from '@/vision/types'
import type { VisionSession } from '@/vision/visionSession'

export interface Processed {
  events: ConductingEvent[]
  snapshot: GestureSnapshot
  frame: HandFrame
}

const UI_INTERVAL_MS = 100

/**
 * Glue between the vision session and the gesture engine: every processed hand frame goes through the engine; consumers
 * receive the structured events (for the audio bridge, recorder, exercises) and a ~10 Hz snapshot store (for the UI).
 * Reusable: `activate()` / `deactivate()` can be called repeatedly (React StrictMode).
 */
export class GestureInput {
  readonly engine: GestureEngine
  readonly store: Store<GestureSnapshot>
  private listeners = new Set<(p: Processed) => void>()
  private unsubFrames: (() => void) | null = null
  private unsubVision: (() => void) | null = null
  private lastUi = -Infinity

  constructor(readonly vision: VisionSession, getConfig: () => GestureConfig = () => gestureSettings.get() ?? DEFAULT_GESTURE_CONFIG) {
    this.engine = new GestureEngine({ getConfig, getCalibration: () => calibrationStore.get() })
    this.store = createStore(this.engine.snapshot)
  }

  /** Subscribe to every processed frame with its events. */
  onProcessed(cb: (p: Processed) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  setTimeSignature(ts: TimeSignature) {
    this.engine.setTimeSignature(ts)
  }
  setTransport(t: TransportHint) {
    this.engine.setTransport(t)
  }
  reset() {
    this.engine.reset()
    this.store.set(this.engine.snapshot)
  }

  activate() {
    if (this.unsubFrames) return
    let aspect = 0
    this.unsubVision = this.vision.store.subscribe(() => {
      const v = this.vision.store.get().videoSize
      if (v && v.width / v.height !== aspect) {
        aspect = v.width / v.height
        this.engine.setAspect(aspect)
      }
    })
    this.unsubFrames = this.vision.onFrame((frame) => {
      if (!frame) {
        // camera/demo stopped: nothing to conduct with any more
        this.engine.reset()
        this.store.set(this.engine.snapshot)
        return
      }
      const events = this.engine.process(frame)
      const snapshot = this.engine.snapshot
      if (frame.timestampMs - this.lastUi >= UI_INTERVAL_MS || events.length > 0) {
        this.lastUi = frame.timestampMs
        this.store.set(snapshot)
      }
      const p: Processed = { events, snapshot, frame }
      this.listeners.forEach((cb) => cb(p))
    })
  }

  deactivate() {
    this.unsubFrames?.()
    this.unsubFrames = null
    this.unsubVision?.()
    this.unsubVision = null
  }
}
