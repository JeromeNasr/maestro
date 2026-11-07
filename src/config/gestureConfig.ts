/**
 * Every tunable parameter of the conducting pipeline lives here, with defaults.
 * Phases 2–5 read from this object; a Settings UI will edit it later.
 * Distances are normalised to hand size / calibrated range unless noted.
 * NOTE (Phase 1): these values are initial analytical guesses and have NOT been tuned
 * against a real webcam. They are expected to change after local testing.
 */
export type TimeSignature = '2/4' | '3/4' | '4/4'

export interface BeatConfig {
  /** Minimum stroke length (fraction of calibrated range) to count as a beat. */
  minAmplitude: number
  /** Minimum peak speed of a stroke (calibrated ranges per second). */
  minPeakSpeed: number
  /** Debounce: reject beats closer than this (ms). */
  minBeatIntervalMs: number
  /** Beats below this confidence are logged but do not influence tempo (0–1). */
  minConfidence: number
  /** Required agreement between stroke direction and the expected pattern step (cosine). */
  directionTolerance: number
}

export interface TempoConfig {
  minBpm: number
  maxBpm: number
  /** Number of recent intervals used for the median outlier filter. */
  medianWindow: number
  /** Exponential smoothing factor applied to BPM updates (0–1, lower = steadier). */
  smoothing: number
  /** Maximum BPM change applied per detected beat (limits sudden jumps). */
  maxBpmStepPerBeat: number
}

export interface DynamicsConfig {
  /** Normalised hand height (0 low – 1 high) thresholds separating pp|p|mp|mf|f|ff. */
  boundaries: [number, number, number, number, number]
  /** Hysteresis band around each boundary to stop flicker. */
  hysteresis: number
  /** Time constant (ms) for smoothing the continuous dynamics value in the audio layer. */
  smoothingMs: number
  /** Slope (units/s) sustained to be classified as crescendo/diminuendo. */
  crescendoSlope: number
}

export interface CueConfig {
  startCueEnabled: boolean
  stopCueEnabled: boolean
  /** Open palm pause/resume is opt-in until shown reliable on real hardware. */
  openPalmPauseEnabled: boolean
  /** Hold durations (ms) — the primary protection against accidental triggers. */
  startHoldMs: number
  stopHoldMs: number
  pauseHoldMs: number
  /** Minimum tracking confidence for a cue to be considered at all (0–1). */
  minConfidence: number
}

export interface TrackingConfig {
  /** Landmark smoothing (One-Euro). */
  filterMinCutoff: number
  filterBeta: number
  /** Keep last hand state for this long after tracking is lost (ms). */
  lossGraceMs: number
  minDetectionConfidence: number
  minTrackingConfidence: number
  /** User-adjustable sensitivity multiplier (1 = default). */
  sensitivity: number
  /**
   * Handedness policy. 'auto' = validate MediaPipe labels against the mirrored preview
   * during calibration before applying any swap (decided in Phase 2). Not applied blindly.
   */
  handednessMode: 'auto' | 'as-reported' | 'swapped'
}

export interface GestureConfig {
  timeSignature: TimeSignature
  beat: BeatConfig
  tempo: TempoConfig
  dynamics: DynamicsConfig
  cues: CueConfig
  tracking: TrackingConfig
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  timeSignature: '4/4',
  beat: { minAmplitude: 0.18, minPeakSpeed: 0.9, minBeatIntervalMs: 220, minConfidence: 0.5, directionTolerance: 0.5 },
  tempo: { minBpm: 40, maxBpm: 200, medianWindow: 5, smoothing: 0.25, maxBpmStepPerBeat: 8 },
  dynamics: { boundaries: [0.17, 0.34, 0.5, 0.67, 0.84], hysteresis: 0.03, smoothingMs: 350, crescendoSlope: 0.15 },
  cues: {
    startCueEnabled: true,
    stopCueEnabled: true,
    openPalmPauseEnabled: false,
    startHoldMs: 800,
    stopHoldMs: 1200,
    pauseHoldMs: 1000,
    minConfidence: 0.7,
  },
  tracking: {
    filterMinCutoff: 1.2,
    filterBeta: 0.02,
    lossGraceMs: 300,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
    sensitivity: 1,
    handednessMode: 'auto',
  },
}
