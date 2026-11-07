import type { TimeSignature } from '@/config/gestureConfig'
import type { DynamicMark } from '@/gesture/dynamicsMapper'

/**
 * One recorded performance. Every field is either MEASURED (counted/timed directly), DERIVED (an estimate computed
 * from the gesture engine's own output) or null = UNAVAILABLE. Nothing is ever defaulted to a "good" value: a
 * performance with no tracking data has null metrics, not perfect ones.
 */
export type DataSource = 'camera' | 'demo' | 'none'

export interface SessionRecord {
  version: 2
  id: string
  startedAt: string
  compositionId: string
  compositionTitle: string
  /** The conducting pattern used (can differ from the written meter: a 4/4 piece conducted in two). */
  timeSignature: TimeSignature
  /** Where the hand data came from. 'none' = the music played but no hands were ever tracked. */
  source: DataSource
  /** The piece reached its end (rather than being stopped early). */
  completed: boolean
  /** MEASURED: seconds of music actually played (audio clock; pauses excluded). */
  playingSec: number
  referenceBpm: number
  beats: {
    /** MEASURED (as classified by the gesture engine): beats accepted as part of the pattern. */
    accepted: number
    usedForTempo: number
    /** Strokes big and fast enough to be a gesture that did not fit the pattern. */
    offPattern: number
    resyncs: number
    skipped: number
  }
  /**
   * DERIVED: accepted / (accepted + offPattern), 0–1. This is the gesture engine's OWN assessment of how well your
   * movements fit the expected pattern — not ground truth (there is none without a reference). Null if no strokes.
   */
  patternAdherence: number | null
  tempo: {
    /** DERIVED: time-weighted mean of the conducted tempo (beats per minute of the conducted pulse). */
    averageBpm: number | null
    minBpm: number | null
    maxBpm: number | null
    /** DERIVED 0–1: how even consecutive beats were (1 = metronomic). Intentional tempo changes are not penalised. */
    consistency: number | null
    /** Coefficient of variation of successive beat intervals. */
    intervalCv: number | null
    /** [seconds into the piece, bpm], ≤ 120 samples, for the history chart. */
    series: [number, number][]
  }
  /** Null when the left hand was never tracked during playback. */
  dynamics: {
    /** MEASURED: seconds the left hand spent at each marking (only while it was actually tracked). */
    secondsByMark: Record<DynamicMark, number>
    /** Seconds of playback during which the left hand was NOT tracked (level held). */
    secondsHeld: number
    minLevel: number
    maxLevel: number
  } | null
  tracking: {
    /** Frames processed while playing. */
    frames: number
    /** MEASURED: fraction of those frames in which each hand was tracked (0–1). null if there were no frames. */
    right: number | null
    left: number | null
    both: number | null
    /** Mean detector confidence while a hand was tracked. */
    meanConfidence: number | null
  }
}

export type Provenance = 'measured' | 'estimate' | 'unavailable'
