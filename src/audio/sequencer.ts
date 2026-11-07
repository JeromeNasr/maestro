import type { SectionId } from '@/orchestra/sections'
import { tempoRatioAt, type Score } from './score'

/** A note placed on the audio clock: when to sound it, for how long, and how hard. Pitch is exactly the MIDI note. */
export interface ScheduledNote {
  section: SectionId
  midi: number
  /** Audio-clock time in seconds. */
  timeSec: number
  durationSec: number
  /** Composer's velocity, 0–1. */
  velocity: number
  kit?: boolean
  /** Score position of the note, for diagnostics. */
  beat: number
}

export interface SequencerOptions {
  /** How far ahead of the audio clock notes are handed to the backend (s). */
  lookaheadSec: number
  /** Time constant of the tempo glide (s): the played tempo approaches the target exponentially. */
  tempoTauSec: number
  /** Hard limit on how fast the tempo may change (BPM per second): a guarantee against jumps. */
  maxSlewBpmPerSec: number
  /** Silence before the first note after play/resume, so the first notes are never late (s). */
  leadInSec: number
  minBpm: number
  maxBpm: number
  /** Integration step (s). */
  stepSec: number
  /** Beats after the last note before the piece counts as finished (lets final notes ring). */
  tailBeats: number
  /** A note later than this when finally scheduled is dropped rather than played in a burst (s). */
  maxLateSec: number
}

export const DEFAULT_SEQUENCER_OPTIONS: SequencerOptions = {
  lookaheadSec: 0.12, tempoTauSec: 0.45, maxSlewBpmPerSec: 45, leadInSec: 0.12, minBpm: 30, maxBpm: 260, stepSec: 0.005, tailBeats: 2, maxLateSec: 0.08,
}

export type SequencerState = 'stopped' | 'playing' | 'paused' | 'finished'

interface Kin { t: number; beat: number; bpm: number }

/**
 * Tempo-following sequencer.
 *
 * MUSICAL TIME, NOT AUDIO STRETCHING. Position is tracked in beats. Tempo (the conductor's BPM × the composer's own
 * tempo map) decides how quickly beats pass; each note is handed to the backend at the audio time its beat falls
 * on, with its own MIDI pitch. Faster tempo = notes closer together and shorter. Pitch is never touched.
 *
 * CONTINUITY. The tempo the music actually plays at glides toward the target (exponential, plus a hard slew limit),
 * so a new target never produces a jump. There is NO phase correction: position only ever advances smoothly with the
 * integrated tempo — it never jumps to line up with a beat.
 *
 * LOOK-AHEAD. `tick(now)` is called every ~25 ms; it advances the position to `now`, projects the tempo forward one
 * look-ahead window, and emits the notes that fall inside it.
 */
export class Sequencer {
  private opts: SequencerOptions
  private _state: SequencerState = 'stopped'
  /** Integration state at time `k.t`; before `k.t` (the lead-in) nothing advances. */
  private k: Kin
  private target: number
  private nextIdx = 0
  private elapsed = 0
  private lateDropped = 0

  constructor(private score: Score, opts: Partial<SequencerOptions> = {}, initialBpm: number = score.referenceBpm) {
    this.opts = { ...DEFAULT_SEQUENCER_OPTIONS, ...opts }
    this.target = this.clampBpm(initialBpm)
    this.k = { t: 0, beat: 0, bpm: this.target }
  }

  get state(): SequencerState {
    return this._state
  }
  /** Conductor tempo the music is gliding toward (quarter-note BPM, before the composer's tempo map). */
  get targetBpm(): number {
    return this.target
  }
  /** Conductor tempo being played right now (after gliding). */
  get currentBpm(): number {
    return this.k.bpm
  }
  /** Actual speed in quarter notes per minute now (conductor tempo × composer's tempo map). */
  get effectiveBpm(): number {
    return this.k.bpm * tempoRatioAt(this.score, this.k.beat)
  }
  /** Notes skipped because the scheduler ran too late to play them on time (the browser was too busy). */
  get droppedLateNotes(): number {
    return this.lateDropped
  }
  get elapsedPlayingSec(): number {
    return this.elapsed
  }
  /** Position (beats) as of the last tick. Use `positionAt` for an exact value. */
  get positionBeats(): number {
    return this.k.beat
  }
  get totalBeats(): number {
    return this.score.totalBeats
  }

  positionAt(nowSec: number): number {
    return this._state === 'playing' ? this.advance(this.k, nowSec).beat : this.k.beat
  }

  // ───────────── transport ─────────────

  play(nowSec: number) {
    if (this._state === 'playing') return
    if (this._state === 'finished' || (this._state === 'stopped' && this.nextIdx >= this.score.notes.length)) this.rewind()
    this._state = 'playing'
    this.k = { ...this.k, t: nowSec + this.opts.leadInSec }
    this.nextIdx = this.indexAtBeat(this.k.beat)
  }

  pause(nowSec: number) {
    if (this._state !== 'playing') return
    this.k = this.advance(this.k, nowSec)
    this._state = 'paused'
  }

  stop() {
    this._state = 'stopped'
    this.rewind()
  }

  /** Jump to a position (only used for rewinding; not for beat alignment). */
  seekToBeat(beat: number, nowSec: number) {
    const b = Math.max(0, Math.min(this.score.totalBeats, beat))
    this.k = { t: this._state === 'playing' ? nowSec + this.opts.leadInSec : nowSec, beat: b, bpm: this.k.bpm }
    this.nextIdx = this.indexAtBeat(b)
  }

  /** Set the conductor's tempo target. Applied from `nowSec` onward; the played tempo glides there. */
  setTargetBpm(bpm: number, nowSec: number) {
    if (this._state === 'playing') this.k = this.advance(this.k, nowSec)
    this.target = this.clampBpm(bpm)
  }

  /** Back to the start with the tempo reset to the score's own. */
  resetTempo() {
    this.target = this.clampBpm(this.score.referenceBpm)
    this.k = { ...this.k, bpm: this.target }
  }

  // ───────────── scheduling ─────────────

  /** Advance to `nowSec` and emit every note whose time falls before `nowSec + lookahead`. Returns the state. */
  tick(nowSec: number, emit: (n: ScheduledNote) => void): SequencerState {
    if (this._state !== 'playing') return this._state
    this.k = this.advance(this.k, nowSec, true)

    // Project the glide forward one look-ahead window (without changing state), remembering (time → beat).
    const start: Kin = { t: Math.max(nowSec, this.k.t), beat: this.k.beat, bpm: this.k.bpm }
    const samples: Kin[] = [start]
    let cur = start
    const horizon = start.t + this.opts.lookaheadSec
    while (cur.t < horizon - 1e-9) {
      cur = this.step(cur, Math.min(this.opts.stepSec, horizon - cur.t))
      samples.push(cur)
    }
    const horizonBeat = cur.beat

    const notes = this.score.notes
    while (this.nextIdx < notes.length && notes[this.nextIdx].startBeat <= horizonBeat) {
      const n = notes[this.nextIdx++]
      const at = this.locate(samples, n.startBeat)
      if (at.late > this.opts.maxLateSec) {
        this.lateDropped++ // far behind (e.g. a stalled tab): skip, don't burst
        continue
      }
      const bpmEff = Math.max(1, at.bpm * tempoRatioAt(this.score, n.startBeat))
      emit({
        section: n.section, midi: n.midi, velocity: n.velocity, beat: n.startBeat, ...(n.kit ? { kit: true } : {}),
        timeSec: at.t, durationSec: Math.max(0.03, (n.durationBeats * 60) / bpmEff),
      })
    }

    if (this.k.beat >= this.score.totalBeats + this.opts.tailBeats) this._state = 'finished'
    return this._state
  }

  // ───────────── internals ─────────────

  private clampBpm(b: number) {
    return Math.max(this.opts.minBpm, Math.min(this.opts.maxBpm, Number.isFinite(b) ? b : this.score.referenceBpm))
  }

  private rewind() {
    this.k = { t: this.k.t, beat: 0, bpm: this.k.bpm }
    this.nextIdx = 0
    this.elapsed = 0
    this.lateDropped = 0
  }

  private indexAtBeat(beat: number): number {
    const n = this.score.notes
    let lo = 0
    let hi = n.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (n[mid].startBeat < beat - 1e-9) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /** One integration step: the tempo glides toward the target (rate-limited), the position advances by it. */
  private step(k: Kin, dt: number): Kin {
    const alpha = 1 - Math.exp(-dt / this.opts.tempoTauSec)
    const maxD = this.opts.maxSlewBpmPerSec * dt
    const delta = Math.max(-maxD, Math.min(maxD, (this.target - k.bpm) * alpha))
    const bpm = k.bpm + delta
    const ratio = tempoRatioAt(this.score, k.beat)
    return { t: k.t + dt, beat: k.beat + ((bpm * ratio) / 60) * dt, bpm }
  }

  private advance(from: Kin, toSec: number, accumulate = false): Kin {
    if (toSec <= from.t) return from
    let k = from
    while (k.t < toSec - 1e-9) {
      const dt = Math.min(this.opts.stepSec, toSec - k.t)
      k = this.step(k, dt)
      if (accumulate) this.elapsed += dt
    }
    return k
  }

  /** Audio time (and tempo) at which a beat falls, by interpolating the projected samples. */
  private locate(samples: Kin[], beat: number): { t: number; bpm: number; late: number } {
    const first = samples[0]
    if (beat <= first.beat) {
      const bpmEff = Math.max(1, first.bpm * tempoRatioAt(this.score, beat))
      return { t: first.t, bpm: first.bpm, late: ((first.beat - beat) * 60) / bpmEff }
    }
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]
      const b = samples[i]
      if (beat <= b.beat) {
        const u = b.beat === a.beat ? 0 : (beat - a.beat) / (b.beat - a.beat)
        return { t: a.t + u * (b.t - a.t), bpm: a.bpm + u * (b.bpm - a.bpm), late: 0 }
      }
    }
    const last = samples[samples.length - 1]
    return { t: last.t, bpm: last.bpm, late: 0 }
  }
}
