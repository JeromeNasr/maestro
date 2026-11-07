import type { TempoConfig } from '@/config/gestureConfig'

export interface TempoState {
  /** Smoothed BPM to drive the music. */
  bpm: number
  /** Median of recent intervals, unsmoothed. */
  rawBpm: number
  /** 0–1; null until there are at least 3 intervals. */
  stability: number | null
  /** Median interval, ms. */
  intervalMs: number
  intervalCount: number
}

export interface BeatInput {
  /** Ictus time, ms. */
  tMs: number
  /** Beats inferred as missed just before this one (the interval is divided accordingly). */
  skipped: number
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * BPM from successive beat intervals, built to avoid unstable jumps:
 *  1. intervals outside [60000/maxBpm, 60000/minBpm] are ignored;
 *  2. a gap much longer than the current beat restarts the interval chain (nothing learned across a tracking loss);
 *  3. an interval far from the recent median is an outlier and ignored — unless several in a row agree, which is a
 *     genuine tempo change and is accepted;
 *  4. the median feeds an exponential smoother whose per-beat change is capped.
 */
export class TempoEstimator {
  private intervals: number[] = []
  private lastT: number | null = null
  private bpm: number | null = null
  private raw: number | null = null
  private pendingOutliers: number[] = []

  constructor(private cfg: TempoConfig) {}

  setConfig(cfg: TempoConfig) {
    this.cfg = cfg
  }

  /** Expected interval (ms) of the next beat, or null if unknown. */
  get intervalMs(): number | null {
    return this.intervals.length ? median(this.intervals) : null
  }
  get state(): TempoState | null {
    if (this.bpm === null || this.raw === null) return null
    return { bpm: this.bpm, rawBpm: this.raw, stability: this.stability(), intervalMs: median(this.intervals), intervalCount: this.intervals.length }
  }

  /** Forget the chain (tracking loss) but keep the last tempo so the music can carry on. */
  breakChain() {
    this.lastT = null
    this.pendingOutliers = []
  }

  reset() {
    this.intervals = []
    this.lastT = null
    this.bpm = null
    this.raw = null
    this.pendingOutliers = []
  }

  /** Returns the new tempo state if this beat changed it, null otherwise. */
  addBeat(b: BeatInput): { state: TempoState; interval: number | null } | null {
    const prev = this.lastT
    this.lastT = b.tMs
    if (prev === null) return null
    const interval = (b.tMs - prev) / (1 + b.skipped)
    const lo = 60000 / this.cfg.maxBpm
    const hi = 60000 / this.cfg.minBpm
    if (interval < lo || interval > hi) return null
    if (this.intervals.length && interval > 2.2 * median(this.intervals) && this.intervals.length >= 2) {
      // far longer than the current beat: a pause in conducting, not a slower tempo
      this.pendingOutliers = []
      return { state: this.state!, interval }
    }

    if (this.intervals.length >= 3) {
      const med = median(this.intervals)
      if (Math.abs(interval - med) / med > this.cfg.outlierFraction) {
        this.pendingOutliers.push(interval)
        const agree = this.pendingOutliers.length >= 3 && this.pendingOutliers.every((x) => Math.abs(x - median(this.pendingOutliers)) / median(this.pendingOutliers) < 0.2)
        if (!agree) return null
        // a real tempo change: adopt the new intervals
        this.intervals = [...this.pendingOutliers]
        this.pendingOutliers = []
      } else {
        this.pendingOutliers = []
        this.push(interval)
      }
    } else {
      this.push(interval)
    }

    const rawBpm = 60000 / median(this.intervals)
    this.raw = rawBpm
    if (this.bpm === null) this.bpm = rawBpm
    else {
      const target = this.bpm + this.cfg.smoothing * (rawBpm - this.bpm)
      const step = Math.max(-this.cfg.maxBpmStepPerBeat, Math.min(this.cfg.maxBpmStepPerBeat, target - this.bpm))
      this.bpm = Math.max(this.cfg.minBpm, Math.min(this.cfg.maxBpm, this.bpm + step))
    }
    return { state: this.state!, interval }
  }

  private push(interval: number) {
    this.intervals.push(interval)
    if (this.intervals.length > this.cfg.medianWindow) this.intervals.shift()
  }

  private stability(): number | null {
    if (this.intervals.length < 3) return null
    const mean = this.intervals.reduce((s, x) => s + x, 0) / this.intervals.length
    const sd = Math.sqrt(this.intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / this.intervals.length)
    return Math.max(0, Math.min(1, 1 - sd / mean / 0.25))
  }
}
