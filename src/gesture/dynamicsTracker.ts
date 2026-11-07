import type { DynamicsConfig } from '@/config/gestureConfig'
import type { TrackedHand } from '@/vision/types'
import { DYNAMIC_MARKS, type DynamicMark } from './dynamicsMapper'
import { handLevel, type VerticalRange } from './handLevel'
import type { DynamicsReading, DynamicsTrend } from './types'

const TREND_WINDOW_MS = 450

/**
 * Left-hand dynamics: hand height → smoothed continuous level → marking (pp…ff) with hysteresis, plus
 * crescendo/diminuendo from the slope of the level. The continuous level (not the marking) is what drives the audio,
 * so loudness glides instead of stepping.
 */
export class DynamicsTracker {
  private level: number
  private seen = false
  private lastT: number | null = null
  private markIdx: number
  private trend: DynamicsTrend = 'steady'
  private history: { t: number; level: number }[] = []

  constructor(private cfg: DynamicsConfig) {
    this.level = cfg.defaultLevel
    this.markIdx = this.indexFor(this.level, 0)
  }

  setConfig(cfg: DynamicsConfig) {
    this.cfg = cfg
  }

  get reading(): DynamicsReading {
    return { level: this.level, mark: DYNAMIC_MARKS[this.markIdx], trend: this.trend, source: this.lastSource }
  }
  private lastSource: DynamicsReading['source'] = 'default'

  reset() {
    this.level = this.cfg.defaultLevel
    this.seen = false
    this.lastT = null
    this.history = []
    this.trend = 'steady'
    this.markIdx = this.indexFor(this.level, 0)
    this.lastSource = 'default'
  }

  update(hand: TrackedHand | null, tMs: number, range: VerticalRange | null): DynamicsReading {
    const dt = this.lastT === null ? 0 : Math.max(0, tMs - this.lastT)
    this.lastT = tMs
    if (hand && hand.status === 'tracking') {
      const raw = handLevel(hand.palm.y, range, this.cfg)
      if (!this.seen) {
        this.level = raw
        this.seen = true
      } else {
        const a = 1 - Math.exp(-dt / Math.max(1, this.cfg.smoothingMs))
        this.level += a * (raw - this.level)
      }
      this.lastSource = 'hand'
    } else if (this.seen) {
      this.lastSource = this.cfg.holdWhenLeftLost ? 'hold' : 'default'
      if (!this.cfg.holdWhenLeftLost) {
        const a = 1 - Math.exp(-dt / 1500)
        this.level += a * (this.cfg.defaultLevel - this.level)
      }
    } else {
      this.lastSource = 'default'
    }

    this.markIdx = this.indexFor(this.level, this.cfg.hysteresis, this.markIdx)
    this.updateTrend(tMs)
    return this.reading
  }

  /** Marking index for a level; with `current`, a boundary must be crossed by `hyst` to change marking. */
  private indexFor(level: number, hyst: number, current?: number): number {
    const b = this.cfg.boundaries
    if (current === undefined || hyst === 0) {
      let i = 0
      while (i < b.length && level >= b[i]) i++
      return i
    }
    let i = current
    while (i < b.length && level >= b[i] + hyst) i++
    while (i > 0 && level < b[i - 1] - hyst) i--
    return i
  }

  private updateTrend(tMs: number) {
    this.history.push({ t: tMs, level: this.level })
    while (this.history.length > 1 && tMs - this.history[0].t > TREND_WINDOW_MS) this.history.shift()
    const first = this.history[0]
    const span = tMs - first.t
    if (span < TREND_WINDOW_MS * 0.6) return
    const slope = ((this.level - first.level) / span) * 1000
    const th = this.cfg.crescendoSlope
    this.trend = slope >= th ? 'crescendo' : slope <= -th ? 'diminuendo' : 'steady'
  }
}

export type { DynamicMark }
