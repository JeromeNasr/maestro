import type { SessionRecord, DataSource } from '@/analytics/types'
import type { TimeSignature } from '@/config/gestureConfig'
import { DYNAMIC_MARKS, type DynamicMark } from '@/gesture/dynamicsMapper'
import type { BeatEvent, GestureSnapshot } from '@/gesture/types'

export interface RecorderMeta {
  compositionId: string
  compositionTitle: string
  timeSignature: TimeSignature
  referenceBpm: number
  startedAt: Date
}

export interface FinishInfo {
  /** Seconds of music played (audio clock). */
  playingSec: number
  completed: boolean
}

/** Recordings shorter than this are discarded: too little to say anything true about. */
export const MIN_RECORDED_SEC = 5
const MAX_SERIES = 120

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
const emptyMarks = () => Object.fromEntries(DYNAMIC_MARKS.map((m) => [m, 0])) as Record<DynamicMark, number>

/**
 * Accumulates what actually happened during a performance. Fed once per processed frame WHILE PLAYING, and with each
 * beat. Pure (no DOM, no clock): all times come from the frames. It never invents data — anything not observed is null.
 */
export class SessionRecorder {
  private meta: RecorderMeta | null = null
  private frames = 0
  private rightFrames = 0
  private leftFrames = 0
  private bothFrames = 0
  private confSum = 0
  private confN = 0
  private sourceVotes: Record<DataSource, number> = { camera: 0, demo: 0, none: 0 }
  private lastT: number | null = null
  private bpmWeighted = 0
  private bpmTime = 0
  private minBpm = Infinity
  private maxBpm = -Infinity
  private series: [number, number][] = []
  private lastSeriesAt = -Infinity
  private elapsedS = 0
  private marks: Record<DynamicMark, number> = emptyMarks()
  private heldS = 0
  private minLevel = Infinity
  private maxLevel = -Infinity
  private handSeconds = 0
  private intervals: number[] = []
  private accepted = 0
  private usedForTempo = 0
  private lastStats: GestureSnapshot['stats'] | null = null

  get active(): boolean {
    return this.meta !== null
  }

  begin(meta: RecorderMeta) {
    this.meta = meta
    this.frames = this.rightFrames = this.leftFrames = this.bothFrames = 0
    this.confSum = this.confN = 0
    this.sourceVotes = { camera: 0, demo: 0, none: 0 }
    this.lastT = null
    this.bpmWeighted = this.bpmTime = 0
    this.minBpm = Infinity
    this.maxBpm = -Infinity
    this.series = []
    this.lastSeriesAt = -Infinity
    this.elapsedS = 0
    this.marks = emptyMarks()
    this.heldS = 0
    this.minLevel = Infinity
    this.maxLevel = -Infinity
    this.handSeconds = 0
    this.intervals = []
    this.accepted = this.usedForTempo = 0
    this.lastStats = null
  }

  /** Call when playback pauses so the time gap is not counted as playing time. */
  gap() {
    this.lastT = null
  }

  /** One processed frame while the music is playing. `source` is the frame's source, or null if there is no hand input. */
  frame(snap: GestureSnapshot, source: 'camera' | 'demo' | null, tMs: number) {
    if (!this.meta) return
    const dt = this.lastT === null ? 0 : Math.min(0.25, Math.max(0, (tMs - this.lastT) / 1000)) // cap: a stall is not playing time
    this.lastT = tMs
    this.elapsedS += dt
    this.lastStats = snap.stats
    this.sourceVotes[source ?? 'none']++
    if (source === null) return

    this.frames++
    if (snap.rightPresent) this.rightFrames++
    if (snap.leftPresent) this.leftFrames++
    if (snap.rightPresent && snap.leftPresent) this.bothFrames++
    for (const c of [snap.rightPresent ? snap.rightConfidence : null, snap.leftPresent ? snap.leftConfidence : null]) {
      if (c !== null) {
        this.confSum += c
        this.confN++
      }
    }

    if (snap.bpm !== null && dt > 0) {
      this.bpmWeighted += snap.bpm * dt
      this.bpmTime += dt
      this.minBpm = Math.min(this.minBpm, snap.bpm)
      this.maxBpm = Math.max(this.maxBpm, snap.bpm)
      if (this.elapsedS - this.lastSeriesAt >= 2) {
        this.lastSeriesAt = this.elapsedS
        this.series.push([Math.round(this.elapsedS * 10) / 10, Math.round(snap.bpm * 10) / 10])
      }
    }

    if (snap.leftPresent && snap.dynamics.source === 'hand') {
      this.marks[snap.dynamics.mark] += dt
      this.handSeconds += dt
      this.minLevel = Math.min(this.minLevel, snap.dynamics.level)
      this.maxLevel = Math.max(this.maxLevel, snap.dynamics.level)
    } else if (dt > 0) {
      this.heldS += dt
    }
  }

  beat(e: BeatEvent) {
    if (!this.meta) return
    this.accepted++
    if (e.usedForTempo) this.usedForTempo++
    // Successive intervals within an unbroken chain only (skips and chain starts have no clean interval).
    if (e.intervalMs !== null && e.skipped === 0) this.intervals.push(e.intervalMs)
  }

  /** Builds the record, or null if there is nothing worth recording. */
  finish(info: FinishInfo): SessionRecord | null {
    const m = this.meta
    this.meta = null
    if (!m || info.playingSec < MIN_RECORDED_SEC) return null

    const votes = this.sourceVotes
    const source: DataSource = this.frames === 0 ? 'none' : votes.camera >= votes.demo ? 'camera' : 'demo'
    const stats = this.lastStats
    const offPattern = stats?.offPattern ?? 0
    const strokes = this.accepted + offPattern
    const hasHands = this.frames > 0

    // Beat-to-beat evenness: mean relative change between consecutive intervals (jitter), 0 = perfectly even.
    let consistency: number | null = null
    let cv: number | null = null
    if (this.intervals.length >= 4) {
      const iv = this.intervals
      const jit = mean(iv.slice(1).map((x, i) => Math.abs(x - iv[i]) / ((x + iv[i]) / 2)))
      consistency = Math.max(0, Math.min(1, 1 - jit / 0.25))
      const mu = mean(iv)
      cv = Math.sqrt(mean(iv.map((x) => (x - mu) ** 2))) / mu
    }

    return {
      version: 2,
      id: `${m.startedAt.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      startedAt: m.startedAt.toISOString(),
      compositionId: m.compositionId,
      compositionTitle: m.compositionTitle,
      timeSignature: m.timeSignature,
      source,
      completed: info.completed,
      playingSec: Math.round(info.playingSec * 10) / 10,
      referenceBpm: m.referenceBpm,
      beats: { accepted: this.accepted, usedForTempo: this.usedForTempo, offPattern, resyncs: stats?.resyncs ?? 0, skipped: stats?.skippedBeats ?? 0 },
      patternAdherence: hasHands && strokes > 0 ? this.accepted / strokes : null,
      tempo: {
        averageBpm: this.bpmTime > 0 ? this.bpmWeighted / this.bpmTime : null,
        minBpm: Number.isFinite(this.minBpm) ? this.minBpm : null,
        maxBpm: Number.isFinite(this.maxBpm) ? this.maxBpm : null,
        consistency,
        intervalCv: cv,
        series: this.series.slice(0, MAX_SERIES),
      },
      dynamics: this.handSeconds > 0 ? { secondsByMark: { ...this.marks }, secondsHeld: this.heldS, minLevel: this.minLevel, maxLevel: this.maxLevel } : null,
      tracking: {
        frames: this.frames,
        right: hasHands ? this.rightFrames / this.frames : null,
        left: hasHands ? this.leftFrames / this.frames : null,
        both: hasHands ? this.bothFrames / this.frames : null,
        meanConfidence: this.confN > 0 ? this.confSum / this.confN : null,
      },
    }
  }
}
