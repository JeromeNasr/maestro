import type { TimeSignature } from '@/config/gestureConfig'
import type { V2 } from './directions'
import { beatsPerBar, cosBetween, expectedStrokes } from './directions'

export interface PatternParams {
  tolerance: number
  downbeatResyncCos: number
  allowSkip: boolean
  /** Stricter cosine for inferring a missed beat. */
  skipCos?: number
}

export type PatternDecision =
  | { accepted: true; beatIndex: number; skipped: number; resynced: boolean; cos: number }
  | { accepted: false; reason: 'off-pattern' | 'awaiting-downbeat' }

/**
 * Pattern state machine. Knows which beat is expected next and which stroke direction arrives at each beat, and
 * decides whether a recognised stroke is that beat. Directions alone are ambiguous (in 4/4 beats 2 and 4 both travel
 * up-left); the state resolves it. Handles one missed beat and re-synchronises on a strong downbeat.
 */
export class PatternTracker {
  private ts: TimeSignature
  private expected: V2[]
  /** 0-based index of the beat expected next; null = waiting for a downbeat. */
  private next: number | null = null

  constructor(ts: TimeSignature, private p: PatternParams) {
    this.ts = ts
    this.expected = expectedStrokes(ts)
  }

  setParams(p: PatternParams) {
    this.p = p
  }

  setTimeSignature(ts: TimeSignature) {
    if (ts === this.ts) return
    this.ts = ts
    this.expected = expectedStrokes(ts)
    this.next = null
  }

  get timeSignature(): TimeSignature {
    return this.ts
  }
  get beats(): number {
    return beatsPerBar(this.ts)
  }
  /** 1-based beat expected next, or null while waiting for the downbeat. */
  get expectedBeat(): number | null {
    return this.next === null ? null : this.next + 1
  }

  reset() {
    this.next = null
  }

  decide(stroke: V2): PatternDecision {
    const n = this.expected.length
    const cos = (i: number) => cosBetween(stroke, this.expected[i])
    if (this.next === null) {
      const c = cos(0)
      if (c >= this.p.tolerance) return this.accept(0, 0, false, c)
      return { accepted: false, reason: 'awaiting-downbeat' }
    }
    const k = this.next
    const ck = cos(k)
    if (ck >= this.p.tolerance) return this.accept(k, 0, false, ck)
    const c0 = cos(0)
    if (k !== 0 && c0 >= this.p.downbeatResyncCos) return this.accept(0, 0, true, c0)
    if (this.p.allowSkip) {
      const k1 = (k + 1) % n
      const c1 = cos(k1)
      if (c1 >= (this.p.skipCos ?? this.p.tolerance)) return this.accept(k1, 1, false, c1)
    }
    return { accepted: false, reason: 'off-pattern' }
  }

  private accept(i: number, skipped: number, resynced: boolean, cos: number): PatternDecision {
    this.next = (i + 1) % this.expected.length
    return { accepted: true, beatIndex: i, skipped, resynced, cos }
  }
}
