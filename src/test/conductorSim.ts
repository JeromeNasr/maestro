import { DEFAULT_GESTURE_CONFIG, type GestureConfig } from '@/config/gestureConfig'
import { GestureEngine } from '@/gesture/gestureEngine'
import type { CalibrationProfile } from '@/vision/calibration'
import { DemoSource, type DemoOptions } from '@/vision/demoSource'
import { HandPipeline } from '@/vision/handPipeline'
import type { ConductingEvent, GestureSnapshot } from '@/gesture/types'
import type { TransportHint } from '@/gesture/cueDetector'

export interface SimOptions {
  demo?: Partial<DemoOptions>
  config?: Partial<GestureConfig>
  seconds: number
  fps?: number
  startMs?: number
  calibration?: CalibrationProfile | null
  transport?: TransportHint
  /** Called each frame before processing; lets a test change the source mid-run. */
  onFrame?: (tMs: number, src: DemoSource, engine: GestureEngine) => void
}

export interface SimResult {
  events: ConductingEvent[]
  snapshots: GestureSnapshot[]
  engine: GestureEngine
  beats: Extract<ConductingEvent, { type: 'beat' }>[]
  tempos: Extract<ConductingEvent, { type: 'tempo' }>[]
}

/**
 * Synthetic-trajectory simulation: DemoSource (synthetic landmarks) → the REAL HandPipeline (smoothing, kinematics,
 * tracking-loss handling) → GestureEngine. It exercises the whole processing chain except MediaPipe itself, so it
 * demonstrates logic, not real-world webcam accuracy.
 */
export function simulate(o: SimOptions): SimResult {
  const config = { ...DEFAULT_GESTURE_CONFIG, ...o.config }
  const src = new DemoSource({ dropouts: false, ...o.demo })
  const pipeline = new HandPipeline({ getConfig: () => config, getHandedness: () => ({ swap: false, verified: true, origin: 'demo' }) })
  const engine = new GestureEngine({ getConfig: () => config, getCalibration: () => o.calibration ?? null })
  engine.setTimeSignature(o.demo?.timeSignature ?? config.timeSignature)
  engine.setTransport(o.transport ?? 'playing')
  const fps = o.fps ?? 30
  const events: ConductingEvent[] = []
  const snapshots: GestureSnapshot[] = []
  const t0 = o.startMs ?? 0
  const n = Math.round(o.seconds * fps)
  for (let i = 0; i <= n; i++) {
    const t = t0 + (i * 1000) / fps
    o.onFrame?.(t, src, engine)
    const frame = pipeline.process(src.detect(t - t0), t, 'demo')
    events.push(...engine.process(frame))
    snapshots.push(engine.snapshot)
  }
  return {
    events, snapshots, engine,
    beats: events.filter((e) => e.type === 'beat') as SimResult['beats'],
    tempos: events.filter((e) => e.type === 'tempo') as SimResult['tempos'],
  }
}
