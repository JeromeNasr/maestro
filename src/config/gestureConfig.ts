/**
 * Every tunable parameter of the conducting pipeline lives here, with defaults.
 * Phases 2–5 read from this object; a Settings UI will edit it later.
 * Distances are normalised to hand size / calibrated range unless noted.
 * NOTE (Phase 1): these values are initial analytical guesses and have NOT been tuned
 * against a real webcam. They are expected to change after local testing.
 */
export type TimeSignature = '2/4' | '3/4' | '4/4'

export interface BeatConfig {
  /** Minimum stroke length, in hand sizes (wrist→middle-finger-base), so it works at any distance from the camera. */
  minAmplitude: number
  /** Minimum peak speed of a stroke, hand sizes per second. */
  minPeakSpeed: number
  /** A stroke begins when palm speed (hand sizes/s) rises above this. */
  strokeStartSpeed: number
  /** The ictus is reached when speed falls below this fraction of the stroke's peak speed. */
  strokeEndRatio: number
  /** A change of travel direction larger than this (degrees) while still moving is a corner = ictus (continuous patterns). */
  turnAngleDeg: number
  minStrokeMs: number
  maxStrokeMs: number
  /** Debounce: reject beats closer than this (ms). */
  minBeatIntervalMs: number
  /** Beats below this confidence are reported but do not influence tempo (0–1). */
  minConfidence: number
  /** Required agreement (cosine) between stroke direction and the expected pattern step. 0.5 ≈ ±60°. */
  directionTolerance: number
  /** Cosine needed for a stroke to be accepted as the downbeat when the pattern is out of sync. */
  downbeatResyncCos: number
  /** Allow one missed beat to be inferred from the direction of the next stroke. */
  allowSkip: boolean
  /** Stricter direction match (cosine) required to INFER a missed beat. */
  skipCos: number
  /** Consecutive beat intervals must agree to within this ratio (e.g. 1.5 = ±50%) before they may change the tempo. */
  maxIntervalRatio: number
  /** Consecutive in-order beats required before beats may change the tempo (defence against lucky random movements). */
  minChainForTempo: number
  /** If the right hand is gone for longer than max(this, 2.5 beats), the pattern restarts at the next downbeat (ms). */
  patternResetGapMs: number
}

export interface TempoConfig {
  minBpm: number
  maxBpm: number
  /** Number of recent intervals used for the median outlier filter and stability. */
  medianWindow: number
  /** Exponential smoothing factor applied to BPM updates (0–1, lower = steadier). */
  smoothing: number
  /** Maximum BPM change applied per detected beat (limits sudden jumps). */
  maxBpmStepPerBeat: number
  /** An interval deviating from the median by more than this fraction is an outlier (unless repeated: a real tempo change). */
  outlierFraction: number
}

export interface DynamicsConfig {
  /** Normalised hand height (0 low – 1 high) thresholds separating pp|p|mp|mf|f|ff. */
  boundaries: [number, number, number, number, number]
  /** Hysteresis band around each boundary to stop flicker. */
  hysteresis: number
  /** Time constant (ms) for smoothing the continuous dynamics level. */
  smoothingMs: number
  /** Slope (level units per second) sustained to be classified as crescendo/diminuendo. */
  crescendoSlope: number
  /** Level used before the left hand has ever been seen (≈ mezzo-forte). */
  defaultLevel: number
  /** Palm y (display space, 0 top … 1 bottom) used for "hand high"/"hand low" when no calibration exists. */
  fallbackHighY: number
  fallbackLowY: number
  /** What to do when the left hand disappears: keep the last level. (Dropping to silence would punish leaving the frame.) */
  holdWhenLeftLost: boolean
}

export interface CueConfig {
  startCueEnabled: boolean
  stopCueEnabled: boolean
  /** Both hands raised and held while playing = pause (and again while paused = resume). */
  pauseCueEnabled: boolean
  /** Open palm pause/resume is opt-in until shown reliable on real hardware. */
  openPalmPauseEnabled: boolean
  /** Hold durations (ms) — the primary protection against accidental triggers. */
  startHoldMs: number
  stopHoldMs: number
  pauseHoldMs: number
  /** Minimum tracking confidence for a cue to be considered at all (0–1). */
  minConfidence: number
  /** A hand is "still" below this speed (hand sizes/s). Conducting never satisfies this for a whole hold. */
  stillSpeed: number
  /** Normalised hand height (0–1) above which a hand counts as raised / below which it counts as lowered. */
  raisedLevel: number
  loweredLevel: number
}

export interface TrackingConfig {
  /** Landmark smoothing (One-Euro). */
  filterMinCutoff: number
  filterBeta: number
  /** Keep last hand state for this long after tracking is lost (ms). */
  lossGraceMs: number
  minDetectionConfidence: number
  minTrackingConfidence: number
  /** User-adjustable sensitivity multiplier (1 = default). Scales detector threshold and beat thresholds. */
  sensitivity: number
  /**
   * Handedness policy. 'auto' = validate MediaPipe labels against the mirrored preview during calibration before
   * applying any swap. Not applied blindly.
   */
  handednessMode: 'auto' | 'as-reported' | 'swapped'
}

export interface CalibrationConfig {
  /** Valid single-hand frames required per handedness step. */
  samplesPerHand: number
  /** Fraction of those frames that must carry the same reported label, otherwise the step fails. */
  minLabelAgreement: number
  /** The palm must be this far beyond the preview's centre line (0–0.5) to count as "on that side". */
  sideMargin: number
  /** Duration of the range-capture step (ms). */
  rangeDurationMs: number
  /** Minimum extent (normalised) a hand must travel in x or y for its range to be accepted. */
  minRangeSpan: number
  /** Each step fails if it has not completed within this time (ms). */
  stepTimeoutMs: number
}

export interface GestureConfig {
  timeSignature: TimeSignature
  beat: BeatConfig
  tempo: TempoConfig
  dynamics: DynamicsConfig
  cues: CueConfig
  tracking: TrackingConfig
  calibration: CalibrationConfig
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  timeSignature: '4/4',
  beat: {
    minAmplitude: 0.7,
    minPeakSpeed: 1.0,
    strokeStartSpeed: 0.5,
    strokeEndRatio: 0.35,
    turnAngleDeg: 70,
    minStrokeMs: 100,
    maxStrokeMs: 2000,
    minBeatIntervalMs: 220,
    minConfidence: 0.45,
    directionTolerance: 0.5,
    downbeatResyncCos: 0.8,
    allowSkip: true,
    skipCos: 0.75,
    maxIntervalRatio: 1.3,
    minChainForTempo: 4,
    patternResetGapMs: 1500,
  },
  tempo: { minBpm: 40, maxBpm: 200, medianWindow: 5, smoothing: 0.35, maxBpmStepPerBeat: 10, outlierFraction: 0.35 },
  dynamics: {
    boundaries: [0.17, 0.34, 0.5, 0.67, 0.84],
    hysteresis: 0.03,
    smoothingMs: 350,
    crescendoSlope: 0.12,
    defaultLevel: 0.58,
    fallbackHighY: 0.2,
    fallbackLowY: 0.8,
    holdWhenLeftLost: true,
  },
  cues: {
    startCueEnabled: true,
    stopCueEnabled: true,
    pauseCueEnabled: true,
    openPalmPauseEnabled: false,
    startHoldMs: 800,
    stopHoldMs: 1200,
    pauseHoldMs: 1000,
    minConfidence: 0.7,
    stillSpeed: 0.6,
    raisedLevel: 0.72,
    loweredLevel: 0.22,
  },
  tracking: {
    // One-Euro parameters for coordinates normalised to the image (speeds are image-widths per second).
    filterMinCutoff: 1.5,
    filterBeta: 4,
    lossGraceMs: 300,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
    sensitivity: 1,
    handednessMode: 'auto',
  },
  calibration: { samplesPerHand: 20, minLabelAgreement: 0.8, sideMargin: 0.08, rangeDurationMs: 6000, minRangeSpan: 0.12, stepTimeoutMs: 30000 },
}
