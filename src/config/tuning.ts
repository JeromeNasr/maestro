import type { GestureConfig } from './gestureConfig'

/** A user-adjustable parameter of the conducting pipeline (shown in the Studio's Tuning panel). */
export interface TuningParam {
  id: string
  group: 'Beats' | 'Tempo' | 'Dynamics' | 'Cues'
  label: string
  help: string
  min: number
  max: number
  step: number
  unit?: string
  get: (c: GestureConfig) => number
  set: (c: GestureConfig, v: number) => GestureConfig
}

const beat = (k: keyof GestureConfig['beat']) => ({
  get: (c: GestureConfig) => c.beat[k] as number,
  set: (c: GestureConfig, v: number): GestureConfig => ({ ...c, beat: { ...c.beat, [k]: v } }),
})
const tempo = (k: keyof GestureConfig['tempo']) => ({
  get: (c: GestureConfig) => c.tempo[k] as number,
  set: (c: GestureConfig, v: number): GestureConfig => ({ ...c, tempo: { ...c.tempo, [k]: v } }),
})
const dyn = (k: keyof GestureConfig['dynamics']) => ({
  get: (c: GestureConfig) => c.dynamics[k] as number,
  set: (c: GestureConfig, v: number): GestureConfig => ({ ...c, dynamics: { ...c.dynamics, [k]: v } }),
})
const cue = (k: keyof GestureConfig['cues']) => ({
  get: (c: GestureConfig) => c.cues[k] as number,
  set: (c: GestureConfig, v: number): GestureConfig => ({ ...c, cues: { ...c.cues, [k]: v } }),
})

/** The thresholds most likely to need adjusting for a particular camera, room and conducting style. */
export const TUNING_PARAMS: TuningParam[] = [
  { id: 'minAmplitude', group: 'Beats', label: 'Minimum stroke size', help: 'Smaller = recognises small gestures but also more jitter.', min: 0.3, max: 2, step: 0.05, unit: 'hand sizes', ...beat('minAmplitude') },
  { id: 'minPeakSpeed', group: 'Beats', label: 'Minimum stroke speed', help: 'Slow, lazy strokes below this are ignored.', min: 0.4, max: 3, step: 0.1, unit: 'hand sizes/s', ...beat('minPeakSpeed') },
  { id: 'directionTolerance', group: 'Beats', label: 'Direction strictness', help: 'Higher = the stroke must point more exactly the way the pattern expects (0.5 ≈ ±60°).', min: 0.2, max: 0.9, step: 0.05, ...beat('directionTolerance') },
  { id: 'minBeatIntervalMs', group: 'Beats', label: 'Shortest beat gap', help: 'Beats closer than this are treated as a double-detection.', min: 120, max: 500, step: 10, unit: 'ms', ...beat('minBeatIntervalMs') },
  { id: 'minChainForTempo', group: 'Beats', label: 'Beats before tempo follows', help: 'In-order beats needed before your tempo moves the music (protects against stray movements).', min: 2, max: 8, step: 1, ...beat('minChainForTempo') },
  { id: 'smoothing', group: 'Tempo', label: 'Tempo smoothing', help: 'Lower = steadier but slower to follow a tempo change.', min: 0.1, max: 0.8, step: 0.05, ...tempo('smoothing') },
  { id: 'maxBpmStepPerBeat', group: 'Tempo', label: 'Largest tempo step per beat', help: 'Caps how quickly the estimated tempo can change.', min: 2, max: 30, step: 1, unit: 'BPM', ...tempo('maxBpmStepPerBeat') },
  { id: 'dynSmoothing', group: 'Dynamics', label: 'Dynamics smoothing', help: 'Higher = louder/softer changes glide more slowly.', min: 100, max: 1200, step: 50, unit: 'ms', ...dyn('smoothingMs') },
  { id: 'crescendoSlope', group: 'Dynamics', label: 'Crescendo sensitivity', help: 'How steady a rise or fall must be to count as crescendo / diminuendo (lower = easier).', min: 0.05, max: 0.4, step: 0.01, ...dyn('crescendoSlope') },
  { id: 'startHold', group: 'Cues', label: 'Start / pause hold time', help: 'Both hands raised and still for this long triggers start, pause or resume.', min: 400, max: 2500, step: 100, unit: 'ms', ...cue('startHoldMs') },
  { id: 'stopHold', group: 'Cues', label: 'Stop hold time', help: 'Both hands lowered and still for this long stops the music.', min: 600, max: 3000, step: 100, unit: 'ms', ...cue('stopHoldMs') },
  { id: 'stillSpeed', group: 'Cues', label: 'How still counts as "still"', help: 'Higher = cues tolerate a little hand movement (but become easier to trigger by accident).', min: 0.2, max: 1.5, step: 0.05, unit: 'hand sizes/s', ...cue('stillSpeed') },
]

/** Returns `value` clamped into a parameter's range and snapped to its step. */
export function clampParam(p: TuningParam, value: number): number {
  const v = Math.max(p.min, Math.min(p.max, Number.isFinite(value) ? value : p.min))
  return Number((Math.round(v / p.step) * p.step).toFixed(6)) // (toFixed avoids float noise such as 0.30000000000000004)
}
