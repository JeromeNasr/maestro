import type { TimeSignature } from '@/config/gestureConfig'
import { beatsPerBar } from '@/gesture/directions'
import type { DynamicMark } from '@/gesture/dynamicsMapper'
import { DYNAMIC_MARKS } from '@/gesture/dynamicsMapper'
import type { ConductingEvent, GestureSnapshot } from '@/gesture/types'

/** Score 0–100 and a pass/fail, from measured behaviour only. */
export interface ExerciseOutcome { score: number; passed: boolean }

// ───────────────────────── tap tempo (no camera) ─────────────────────────

export interface TapResult extends ExerciseOutcome {
  taps: number
  /** Measured tempo of the taps (beats/min), from the mean interval. */
  bpm: number | null
  /** |measured − target| / target, in percent. */
  tempoErrorPct: number | null
  /** Coefficient of variation of the intervals, in percent (lower = steadier). */
  steadinessPct: number | null
  /** Taps still needed before the exercise can be evaluated. */
  needed: number
}

export const TAPS_REQUIRED = 12
const PASS_TEMPO_ERR = 8
const PASS_STEADINESS = 12

/**
 * Tap along to a pulse. Judged on tempo accuracy against the target and on steadiness (evenness of the taps), both
 * measured from the tap times — there is nothing subjective. Intervals above 2× the target beat are ignored as pauses.
 */
export function evaluateTaps(tapTimesMs: number[], targetBpm: number): TapResult {
  const beat = 60000 / targetBpm
  const iv: number[] = []
  for (let i = 1; i < tapTimesMs.length; i++) {
    const d = tapTimesMs[i] - tapTimesMs[i - 1]
    if (d > 0 && d < 2 * beat) iv.push(d)
  }
  const needed = Math.max(0, TAPS_REQUIRED - tapTimesMs.length)
  if (iv.length < TAPS_REQUIRED - 1) return { score: 0, passed: false, taps: tapTimesMs.length, bpm: null, tempoErrorPct: null, steadinessPct: null, needed }
  const mean = iv.reduce((a, b) => a + b, 0) / iv.length
  const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length)
  const bpm = 60000 / mean
  const err = (Math.abs(bpm - targetBpm) / targetBpm) * 100
  const steady = (sd / mean) * 100
  const score = Math.max(0, Math.min(100, 100 - 5 * err - 4 * steady))
  return { score, passed: err <= PASS_TEMPO_ERR && steady <= PASS_STEADINESS, taps: tapTimesMs.length, bpm, tempoErrorPct: err, steadinessPct: steady, needed: 0 }
}

// ───────────────────────── conducting a pattern (camera) ─────────────────────────

export interface PatternState extends ExerciseOutcome {
  /** Complete, in-order bars in a row. */
  consecutiveBars: number
  barsRequired: number
  /** Beat (1-based) of the current bar that was last accepted, 0 = between bars. */
  beatInBar: number
  accepted: number
  offPattern: number
  elapsedMs: number
  timedOut: boolean
}

export interface PatternOptions {
  timeSignature: TimeSignature
  barsRequired?: number
  timeLimitMs?: number
  /** Beats only count while this holds for the latest gesture snapshot (used to require dynamics at the same time). */
  gate?: (s: GestureSnapshot) => boolean
}

/**
 * "Conduct N clean bars": N complete bars in a row, beats arriving in order 1…n, with no off-pattern stroke in between.
 * Fed the gesture engine's real events. Score is the share of gesture-like strokes that fitted the pattern.
 */
export class PatternExercise {
  private n: number
  private bars = 0
  private beat = 0
  private accepted = 0
  private off = 0
  private start: number | null = null
  private now = 0
  private done = false

  constructor(private o: PatternOptions) {
    this.n = beatsPerBar(o.timeSignature)
  }

  get state(): PatternState {
    const required = this.o.barsRequired ?? 3
    const strokes = this.accepted + this.off
    const timedOut = !this.done && this.start !== null && this.now - this.start > (this.o.timeLimitMs ?? 90000)
    return {
      consecutiveBars: this.bars, barsRequired: required, beatInBar: this.beat, accepted: this.accepted, offPattern: this.off,
      elapsedMs: this.start === null ? 0 : this.now - this.start, timedOut,
      score: strokes === 0 ? 0 : (this.accepted / strokes) * 100, passed: this.done,
    }
  }

  feed(events: readonly ConductingEvent[], snapshot: GestureSnapshot, nowMs: number) {
    this.now = nowMs
    if (this.done) return
    for (const e of events) {
      if (e.type === 'beat') {
        if (this.start === null) this.start = nowMs
        const gateOk = this.o.gate ? this.o.gate(snapshot) : true
        this.accepted++
        if (!gateOk) {
          this.bars = 0
          this.beat = 0
          continue
        }
        if (e.skipped > 0 || e.resynced) {
          // a missed or re-synchronised beat means the bar was not clean
          this.bars = 0
          this.beat = e.beatInBar === 1 ? 1 : 0
          continue
        }
        if (e.beatInBar === 1) this.beat = 1
        else if (this.beat === e.beatInBar - 1) this.beat = e.beatInBar
        else this.beat = 0
        if (this.beat === this.n) {
          this.bars++
          this.beat = 0
          if (this.bars >= (this.o.barsRequired ?? 3)) this.done = true
        }
      } else if (e.type === 'stroke-rejected' && e.reason === 'off-pattern') {
        this.off++
        this.bars = 0
        this.beat = 0
      }
    }
  }
}

// ───────────────────────── holding dynamics (camera) ─────────────────────────

export interface DynamicsState extends ExerciseOutcome {
  targets: DynamicMark[]
  index: number
  /** 0–1 progress through the current hold. */
  holdProgress: number
  reached: number
  failed: boolean
}

export interface DynamicsOptions {
  targets?: DynamicMark[]
  holdMs?: number
  /** Time allowed for each target (ms). */
  perTargetMs?: number
}

/**
 * "Reach each marking with the left hand and hold it": every target marking must be shown by the LEFT hand (actually
 * tracked, not a held pose) continuously for `holdMs`. Fed the gesture snapshots.
 */
export class DynamicsExercise {
  private targets: DynamicMark[]
  private i = 0
  private since: number | null = null
  private targetStart: number | null = null
  private reached = 0
  private failed = false
  private lastHold = 0

  constructor(private o: DynamicsOptions = {}) {
    this.targets = o.targets ?? ['p', 'f', 'pp', 'ff']
  }

  get state(): DynamicsState {
    return { targets: this.targets, index: Math.min(this.i, this.targets.length - 1), holdProgress: this.lastHold, reached: this.reached, failed: this.failed, score: (this.reached / this.targets.length) * 100, passed: this.reached === this.targets.length }
  }

  feed(snapshot: GestureSnapshot, nowMs: number) {
    if (this.failed || this.i >= this.targets.length) return
    const hold = this.o.holdMs ?? 1500
    this.targetStart ??= nowMs
    const target = this.targets[this.i]
    const showing = snapshot.leftPresent && snapshot.dynamics.source === 'hand' && snapshot.dynamics.mark === target
    if (showing) {
      this.since ??= nowMs
      this.lastHold = Math.min(1, (nowMs - this.since) / hold)
      if (nowMs - this.since >= hold) {
        this.reached++
        this.i++
        this.since = null
        this.targetStart = nowMs
        this.lastHold = 0
      }
    } else {
      this.since = null
      this.lastHold = 0
      if (nowMs - this.targetStart > (this.o.perTargetMs ?? 25000)) this.failed = true
    }
  }
}

export const DYNAMICS_ORDER = DYNAMIC_MARKS
