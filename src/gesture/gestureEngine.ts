import type { GestureConfig, TimeSignature } from '@/config/gestureConfig'
import type { CalibrationProfile } from '@/vision/calibration'
import type { HandFrame, TrackedHand } from '@/vision/types'
import { CueDetector, type TransportHint } from './cueDetector'
import { directionName, type V2 } from './directions'
import { DynamicsTracker } from './dynamicsTracker'
import type { VerticalRange } from './handLevel'
import { PatternTracker } from './patternTracker'
import { StrokeSegmenter, type StrokeCandidate } from './strokeSegmenter'
import { TempoEstimator } from './tempoEstimator'
import type { BeatEvent, ConductingEvent, ConductingState, CueProgress, EngineStats, GestureSnapshot, RejectReason } from './types'

export interface EngineDeps {
  getConfig: () => GestureConfig
  /** Calibration result, if any (vertical ranges are used for dynamics and cues). */
  getCalibration?: () => CalibrationProfile | null
}

export function rangesFromProfile(p: CalibrationProfile | null | undefined): { left: VerticalRange | null; right: VerticalRange | null } {
  const conv = (r: CalibrationProfile['ranges']['left']): VerticalRange | null => (r ? { highY: r.minY, lowY: r.maxY } : null)
  return { left: conv(p?.ranges.left ?? null), right: conv(p?.ranges.right ?? null) }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const emptyStats = (): EngineStats => ({ beatsAccepted: 0, offPattern: 0, tooSoon: 0, ignored: 0, skippedBeats: 0, resyncs: 0 })

/**
 * The conducting gesture engine. Input: processed hand frames (display space, smoothed, with kinematics). Output:
 * structured conducting events (beats, tempo, dynamics, cues, state) and a per-frame snapshot. No React, no DOM, no
 * timers: time comes only from the frames, so it is deterministic and testable with synthetic trajectories.
 *
 * RIGHT hand → strokes → pattern state → beats → tempo.   LEFT hand → height → dynamics.   BOTH hands → cues.
 * The two hands never influence each other's responsibilities (cues are the only joint gesture).
 */
export class GestureEngine {
  private segmenter: StrokeSegmenter
  private pattern: PatternTracker
  private tempo: TempoEstimator
  private dynamics: DynamicsTracker
  private cues = new CueDetector()

  private transport: TransportHint = 'stopped'
  private aspect = 4 / 3
  private handSize: number | null = null
  private rightLastSeenMs: number | null = null
  private lastBeat: { tMs: number; detectedMs: number; beatInBar: number; confidence: number } | null = null
  private beatCount = 0
  /** Consecutive accepted, in-order beats; an off-pattern stroke or a long gap breaks it. */
  private chain = 0
  private pendingTempo: { tMs: number; skipped: number }[] = []
  /** The latest strokes of ANY size (accepted or not): evidence of a regular small gesture, see `adaptiveThresholds`. */
  private recentStrokes: { amplitude: number; peakSpeed: number; ictusMs: number }[] = []
  /** Ictus times (and inferred gaps) of the current chain, for the regularity check. */
  private chainBeats: { tMs: number; skipped: number }[] = []
  private bar = 0
  private state: ConductingState = 'no-hand'
  private stats = emptyStats()
  private lastDynMark: string | null = null
  private lastDynTrend: string | null = null
  private cueProgress: CueProgress = { cue: null, progress: 0 }
  private lastFrame: HandFrame | null = null
  private snapshotCache: GestureSnapshot | null = null

  constructor(private deps: EngineDeps) {
    const cfg = deps.getConfig()
    this.segmenter = new StrokeSegmenter(this.segParams(cfg))
    this.pattern = new PatternTracker(cfg.timeSignature, this.patternParams(cfg))
    this.tempo = new TempoEstimator(cfg.tempo)
    this.dynamics = new DynamicsTracker(cfg.dynamics)
  }

  // ───────────── control ─────────────

  setTimeSignature(ts: TimeSignature) {
    this.pattern.setTimeSignature(ts)
  }
  /** Image width/height, so horizontal and vertical movement are compared in the same units. */
  setAspect(aspect: number) {
    if (aspect > 0.2 && aspect < 5) this.aspect = aspect
  }
  /** What the music is doing; decides which cue a pose means. */
  setTransport(t: TransportHint) {
    this.transport = t
  }
  reset() {
    this.segmenter.abort()
    this.pattern.reset()
    this.tempo.reset()
    this.dynamics.reset()
    this.cues.reset()
    this.handSize = null
    this.rightLastSeenMs = null
    this.lastBeat = null
    this.beatCount = 0
    this.chain = 0
    this.pendingTempo = []
    this.chainBeats = []
    this.recentStrokes = []
    this.bar = 0
    this.state = 'no-hand'
    this.stats = emptyStats()
    this.lastDynMark = null
    this.lastDynTrend = null
    this.cueProgress = { cue: null, progress: 0 }
    this.lastFrame = null
    this.snapshotCache = null
  }

  // ───────────── per-frame processing ─────────────

  process(frame: HandFrame): ConductingEvent[] {
    const cfg = this.deps.getConfig()
    this.segmenter.setParams(this.segParams(cfg))
    this.pattern.setParams(this.patternParams(cfg))
    this.tempo.setConfig(cfg.tempo)
    this.dynamics.setConfig(cfg.dynamics)

    const events: ConductingEvent[] = []
    const t = frame.timestampMs
    this.lastFrame = frame
    const ranges = rangesFromProfile(this.deps.getCalibration?.())

    this.right(frame.right, t, cfg, events)

    const before = this.dynamics.reading
    const dyn = this.dynamics.update(frame.left, t, ranges.left)
    if (dyn.mark !== this.lastDynMark || dyn.trend !== this.lastDynTrend) {
      if (this.lastDynMark !== null || dyn.mark !== before.mark || dyn.trend !== 'steady') {
        events.push({ type: 'dynamics', timestampMs: t, level: dyn.level, mark: dyn.mark, trend: dyn.trend })
      }
      this.lastDynMark = dyn.mark
      this.lastDynTrend = dyn.trend
    }

    const cue = this.cues.update(frame, this.transport, cfg.cues, cfg.dynamics, ranges)
    this.cueProgress = cue.progress
    if (cue.cue) events.push({ type: 'cue', timestampMs: t, cue: cue.cue.kind, source: cue.cue.source })

    this.updateState(t, frame, events)
    this.snapshotCache = null
    return events
  }

  get snapshot(): GestureSnapshot {
    if (this.snapshotCache) return this.snapshotCache
    const f = this.lastFrame
    const tempo = this.tempo.state
    const snap: GestureSnapshot = {
      timestampMs: f?.timestampMs ?? 0,
      state: this.state,
      timeSignature: this.pattern.timeSignature,
      beatInBar: this.lastBeat?.beatInBar ?? null,
      expectedBeat: this.pattern.expectedBeat,
      bpm: tempo?.bpm ?? null,
      rawBpm: tempo?.rawBpm ?? null,
      tempoStability: tempo?.stability ?? null,
      lastBeatConfidence: this.lastBeat?.confidence ?? null,
      dynamics: this.dynamics.reading,
      rightPresent: f?.right?.status === 'tracking',
      leftPresent: f?.left?.status === 'tracking',
      rightConfidence: f?.right?.confidence ?? 0,
      leftConfidence: f?.left?.confidence ?? 0,
      cue: this.cueProgress,
      stats: { ...this.stats },
    }
    this.snapshotCache = snap
    return snap
  }

  // ───────────── right hand: strokes → beats → tempo ─────────────

  private right(hand: TrackedHand | null, t: number, cfg: GestureConfig, events: ConductingEvent[]) {
    if (!hand || hand.status !== 'tracking') {
      // Lost or only a stale "held" pose: a frozen hand has zero velocity and must not be read as a stop. Drop any
      // stroke in progress; the pattern/tempo state is kept for a while so brief tracking loss is harmless.
      this.segmenter.abort()
      return
    }
    // Resume after a gap: a long gap forgets the pattern position (and the tempo chain), a short one does not.
    if (this.rightLastSeenMs !== null) {
      const gap = t - this.rightLastSeenMs
      const interval = this.tempo.intervalMs ?? 0
      if (gap > Math.max(cfg.beat.patternResetGapMs, 2.5 * interval)) {
        this.pattern.reset()
        this.breakChain()
      } else if (gap > 150) {
        this.breakChain()
      }
    }
    this.rightLastSeenMs = t

    this.handSize = this.handSize === null ? hand.handSize : this.handSize + 0.2 * (hand.handSize - this.handSize)
    const hs = Math.max(0.03, this.handSize)
    const pos: V2 = { x: (hand.palm.x * this.aspect) / hs, y: hand.palm.y / hs }
    const vel: V2 = { x: (hand.kinematics.velocity.x * this.aspect) / hs, y: hand.kinematics.velocity.y / hs }
    const stroke = this.segmenter.update({ tMs: t, pos, vel })
    if (stroke) this.evaluate(stroke, hand, t, cfg, events)
  }

  private evaluate(s: StrokeCandidate, hand: TrackedHand, t: number, cfg: GestureConfig, events: ConductingEvent[]) {
    const b = cfg.beat
    const sens = Math.max(0.25, cfg.tracking.sensitivity)
    const { minAmp, minPeak } = this.adaptiveThresholds(s, b.minAmplitude / sens, b.minPeakSpeed / sens)
    const reject = (reason: RejectReason) => {
      if (reason === 'too-soon') this.stats.tooSoon++
      else if (reason === 'off-pattern') {
        this.stats.offPattern++
        this.breakChain()
      }
      else if (reason !== 'awaiting-downbeat') this.stats.ignored++
      // Report only movements that looked like deliberate strokes; tiny jitter would be noise.
      if (s.amplitude >= 0.5 * minAmp) {
        events.push({ type: 'stroke-rejected', timestampMs: t, reason, amplitude: s.amplitude, peakSpeed: s.peakSpeed, direction: directionName(s.vector) })
      }
    }
    if (s.amplitude < minAmp) return reject('too-small')
    if (s.peakSpeed < minPeak || s.durationMs > b.maxStrokeMs) return reject('too-slow')
    if (s.durationMs < b.minStrokeMs) return reject('too-brief')
    if (this.lastBeat && s.ictusMs - this.lastBeat.tMs < b.minBeatIntervalMs) return reject('too-soon')

    const decision = this.pattern.decide(s.vector)
    if (!decision.accepted) return reject(decision.reason)

    // Interval and timing plausibility (against the tempo so far).
    const prevT = this.lastBeat && this.rightLastSeenGapOk(s.ictusMs) ? this.lastBeat.tMs : null
    const intervalMs = prevT === null ? null : (s.ictusMs - prevT) / (1 + decision.skipped)
    const expected = this.tempo.intervalMs
    let timing = 1
    if (intervalMs !== null && expected !== null && expected > 0) {
      const r = intervalMs / expected
      timing = r >= 0.75 && r <= 1.33 ? 1 : r >= 0.5 && r <= 2 ? 0.6 : 0.25
    }
    const parts = [
      clamp01(s.amplitude / (1.8 * minAmp)),
      clamp01(s.peakSpeed / (1.8 * minPeak)),
      clamp01((decision.cos - 0.2) / 0.7),
      clamp01(hand.confidence),
      timing,
    ]
    const confidence = Math.pow(parts.reduce((a, x) => a * Math.max(x, 0.02), 1), 1 / parts.length)
    const usedForTempo = confidence >= b.minConfidence

    this.beatCount++
    const beatInBar = decision.beatIndex + 1
    if (beatInBar === 1) this.bar++
    this.stats.beatsAccepted++
    this.stats.skippedBeats += decision.skipped
    if (decision.resynced) this.stats.resyncs++
    this.lastBeat = { tMs: s.ictusMs, detectedMs: t, beatInBar, confidence }

    const beat: BeatEvent = {
      type: 'beat', index: this.beatCount, beatInBar, bar: Math.max(1, this.bar), timestampMs: s.ictusMs, detectedAtMs: t,
      direction: directionName(s.vector), intervalMs, skipped: decision.skipped, resynced: decision.resynced, confidence, usedForTempo,
    }
    events.push(beat)

    this.chain++
    this.chainBeats.push({ tMs: s.ictusMs, skipped: decision.skipped })
    if (this.chainBeats.length > 4) this.chainBeats.shift()
    if (!usedForTempo) {
      // Keep the chain intact so the next good beat measures from this one, but don't learn from it.
      this.tempo.breakChain()
      this.pendingTempo = []
    } else if (this.chain >= b.minChainForTempo) {
      if (!this.regular(b.maxIntervalRatio)) {
        // In-order beats, but too uneven to trust as a tempo (typical of random waving): don't learn from this stretch.
        this.tempo.breakChain()
        this.pendingTempo = []
        return
      }
      // Chain established: feed everything gathered since it began, then follow beat by beat.
      let res: ReturnType<TempoEstimator['addBeat']> = null
      for (const p of [...this.pendingTempo, { tMs: s.ictusMs, skipped: decision.skipped }]) res = this.tempo.addBeat(p) ?? res
      this.pendingTempo = []
      if (res) events.push({ type: 'tempo', timestampMs: t, bpm: res.state.bpm, rawBpm: res.state.rawBpm, stability: res.state.stability ?? 0 })
    } else {
      this.pendingTempo.push({ tMs: s.ictusMs, skipped: decision.skipped })
    }
  }

  /**
   * Small-gesture adaptation. The default thresholds suit a comfortable, orchestra-sized stroke; people with a small
   * gesture (or a cramped space) would have most beats rejected as "too small". When the last few strokes are REGULAR —
   * similar in size and evenly spaced in time, which random waving and tremor are not — the amplitude and speed
   * thresholds relax to just below those strokes. A hard floor (30 % of the default) means that tremor, drifting
   * and fidgeting can never qualify, and strokes that are larger than the default are unaffected.
   */
  private adaptiveThresholds(s: StrokeCandidate, minAmp: number, minPeak: number): { minAmp: number; minPeak: number } {
    const r = this.recentStrokes
    r.push({ amplitude: s.amplitude, peakSpeed: s.peakSpeed, ictusMs: s.ictusMs })
    if (r.length > 6) r.shift()
    const last = r.slice(-4)
    if (last.length < 4) return { minAmp, minPeak }
    const floor = 0.3 * minAmp
    const amps = last.map((x) => x.amplitude)
    const lo = Math.min(...amps)
    const hi = Math.max(...amps)
    if (lo < floor || hi / lo > 2.2) return { minAmp, minPeak }
    const gaps = last.slice(1).map((x, i) => x.ictusMs - last[i].ictusMs)
    const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length
    const cv = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length) / mean
    if (mean < this.deps.getConfig().beat.minBeatIntervalMs || mean > 2000 || cv > 0.35) return { minAmp, minPeak }
    const relaxedAmp = Math.max(floor, Math.min(minAmp, 0.8 * lo))
    const ratio = Math.max(0.35, Math.min(1, relaxedAmp / minAmp))
    return { minAmp: relaxedAmp, minPeak: minPeak * ratio }
  }

  /** The last two beat intervals of the chain agree to within `maxRatio`. */
  private regular(maxRatio: number): boolean {
    const c = this.chainBeats
    if (c.length < 3) return true
    const iv = (i: number) => (c[i].tMs - c[i - 1].tMs) / (1 + c[i].skipped)
    const a = iv(c.length - 2)
    const bb = iv(c.length - 1)
    const r = Math.max(a, bb) / Math.max(1, Math.min(a, bb))
    return r <= maxRatio
  }

  private breakChain() {
    this.chain = 0
    this.pendingTempo = []
    this.chainBeats = []
    this.tempo.breakChain()
  }

  /** The interval to the last beat is only meaningful if tracking was continuous enough in between. */
  private rightLastSeenGapOk(ictusMs: number): boolean {
    const limit = Math.max(this.deps.getConfig().beat.patternResetGapMs, 2.5 * (this.tempo.intervalMs ?? 0))
    return this.lastBeat !== null && ictusMs - this.lastBeat.tMs <= limit
  }

  // ───────────── conducting state ─────────────

  private updateState(t: number, frame: HandFrame, events: ConductingEvent[]) {
    const rightOk = frame.right?.status === 'tracking'
    const interval = this.tempo.intervalMs ?? 800
    const recent = this.lastBeat !== null && t - this.lastBeat.detectedMs <= Math.max(1500, 2.2 * interval)
    let next: ConductingState
    if (!rightOk) next = recent || this.state === 'conducting' || this.state === 'stalled' ? 'tracking-lost' : 'no-hand'
    else if (recent && this.pattern.expectedBeat !== null) next = this.chain >= 2 ? 'conducting' : 'waiting'
    else if (this.lastBeat && this.pattern.expectedBeat !== null) next = 'stalled'
    else next = 'waiting'
    if (!rightOk && this.state === 'tracking-lost' && !recent && t - (this.rightLastSeenMs ?? t) > Math.max(this.deps.getConfig().beat.patternResetGapMs, 2.5 * interval)) next = 'no-hand'
    if (next !== this.state) {
      events.push({ type: 'state', timestampMs: t, state: next, previous: this.state })
      this.state = next
    }
  }

  private segParams(cfg: GestureConfig) {
    const sens = Math.max(0.25, cfg.tracking.sensitivity)
    return { startSpeed: cfg.beat.strokeStartSpeed / sens, endRatio: cfg.beat.strokeEndRatio, turnAngleDeg: cfg.beat.turnAngleDeg, maxStrokeMs: cfg.beat.maxStrokeMs }
  }
  private patternParams(cfg: GestureConfig) {
    return { tolerance: cfg.beat.directionTolerance, downbeatResyncCos: cfg.beat.downbeatResyncCos, allowSkip: cfg.beat.allowSkip, skipCos: cfg.beat.skipCos }
  }
}
