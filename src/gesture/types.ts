import type { DynamicMark } from './dynamicsMapper'
import type { TimeSignature } from '@/config/gestureConfig'

/**
 * Structured output of the gesture engine. The engine is independent of React and the DOM: it consumes processed hand
 * frames (src/vision/types.ts) and emits these events plus a per-frame snapshot.
 */
export type DirectionName = 'right' | 'down-right' | 'down' | 'down-left' | 'left' | 'up-left' | 'up' | 'up-right'

export type ConductingState =
  | 'no-hand' //   right hand not visible (and not conducting)
  | 'waiting' //   right hand visible, waiting for a recognisable downbeat
  | 'conducting' // valid beats are arriving
  | 'stalled' //   right hand visible but no valid beat for a while (tempo is held)
  | 'tracking-lost' // was conducting and the right hand disappeared (tempo is held)

export type RejectReason = 'too-small' | 'too-slow' | 'too-brief' | 'too-soon' | 'off-pattern' | 'awaiting-downbeat'

export interface BeatEvent {
  type: 'beat'
  /** Running count of accepted beats in this engine session (1-based). */
  index: number
  /** Position in the bar, 1-based (1 = downbeat). */
  beatInBar: number
  bar: number
  /** Time of the ictus itself (ms, frame clock). */
  timestampMs: number
  /** Time the engine recognised it (a few frames later). */
  detectedAtMs: number
  direction: DirectionName
  /** Interval to the previous accepted beat in ms, divided by (1 + skipped); null for the first beat of a chain. */
  intervalMs: number | null
  /** Number of beats inferred as missed immediately before this one (0 or 1). */
  skipped: number
  /** True when the downbeat re-synchronised an out-of-sync pattern. */
  resynced: boolean
  /** 0–1, from stroke amplitude, speed, direction match, tracking confidence and timing plausibility. */
  confidence: number
  /** False for low-confidence beats: reported but they do not move the tempo. */
  usedForTempo: boolean
}

export interface TempoEvent {
  type: 'tempo'
  timestampMs: number
  /** Smoothed tempo that should drive the music (conducted beats per minute). */
  bpm: number
  /** Median of recent intervals, before smoothing. */
  rawBpm: number
  /** 0–1: 1 = perfectly even beats; derived from the coefficient of variation of recent intervals. */
  stability: number
}

export interface DynamicsEvent {
  type: 'dynamics'
  timestampMs: number
  level: number
  mark: DynamicMark
  trend: DynamicsTrend
}
export type DynamicsTrend = 'steady' | 'crescendo' | 'diminuendo'

export type CueKind = 'start' | 'stop' | 'pause' | 'resume'
export interface CueEvent {
  type: 'cue'
  timestampMs: number
  cue: CueKind
  source: 'both-hands' | 'open-palm'
}

export interface StrokeRejectedEvent {
  type: 'stroke-rejected'
  timestampMs: number
  reason: RejectReason
  amplitude: number
  peakSpeed: number
  direction: DirectionName
}

export interface StateEvent {
  type: 'state'
  timestampMs: number
  state: ConductingState
  previous: ConductingState
}

export type ConductingEvent = BeatEvent | TempoEvent | DynamicsEvent | CueEvent | StrokeRejectedEvent | StateEvent

export interface DynamicsReading {
  /** Smoothed continuous level, 0 (softest) – 1 (loudest). */
  level: number
  mark: DynamicMark
  trend: DynamicsTrend
  /** 'hand' = live from the left hand; 'hold' = left hand lost, last level kept; 'default' = never seen. */
  source: 'hand' | 'hold' | 'default'
}

export interface CueProgress {
  cue: CueKind | null
  /** 0–1 progress through the hold; 0 when no cue pose is being held. */
  progress: number
}

export interface EngineStats {
  beatsAccepted: number
  /** Strokes that were big and fast enough to be a gesture but did not fit the pattern / timing. */
  offPattern: number
  tooSoon: number
  /** Small or slow movements ignored as jitter. */
  ignored: number
  skippedBeats: number
  resyncs: number
}

export interface GestureSnapshot {
  timestampMs: number
  state: ConductingState
  timeSignature: TimeSignature
  /** Beat position of the most recent accepted beat (1-based), or null. */
  beatInBar: number | null
  /** The beat the pattern expects next (1-based), or null while waiting for the downbeat. */
  expectedBeat: number | null
  bpm: number | null
  rawBpm: number | null
  /** 0–1, null until there are enough intervals. */
  tempoStability: number | null
  lastBeatConfidence: number | null
  dynamics: DynamicsReading
  rightPresent: boolean
  leftPresent: boolean
  rightConfidence: number
  leftConfidence: number
  cue: CueProgress
  stats: EngineStats
}
