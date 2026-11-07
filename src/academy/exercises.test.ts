import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import type { BeatEvent, ConductingEvent, GestureSnapshot } from '@/gesture/types'
import { rng } from '@/test/fixtures'
import { simulate } from '@/test/conductorSim'
import { DynamicsExercise, evaluateTaps, PatternExercise, TAPS_REQUIRED } from './exercises'

const taps = (n: number, intervalMs: number, jitterMs = 0, seed = 1) => {
  const r = rng(seed)
  const out = [0]
  for (let i = 1; i < n; i++) out.push(out[i - 1] + intervalMs + (r() - 0.5) * 2 * jitterMs)
  return out
}

describe('evaluateTaps', () => {
  it('needs enough taps before it will judge', () => {
    const r = evaluateTaps(taps(5, 750), 80)
    expect(r).toMatchObject({ passed: false, bpm: null, score: 0, taps: 5, needed: TAPS_REQUIRED - 5 })
  })

  it('a steady, accurate tapper passes with a high score', () => {
    const r = evaluateTaps(taps(16, 750, 15), 80)
    expect(r.passed).toBe(true)
    expect(r.bpm!).toBeCloseTo(80, 0)
    expect(r.tempoErrorPct!).toBeLessThan(2)
    expect(r.steadinessPct!).toBeLessThan(5)
    expect(r.score).toBeGreaterThan(85)
  })

  it('the wrong tempo fails even if perfectly even', () => {
    const r = evaluateTaps(taps(16, 600), 80) // 100 BPM
    expect(r.passed).toBe(false)
    expect(r.tempoErrorPct!).toBeCloseTo(25, 0)
    expect(r.score).toBeLessThan(10)
  })

  it('an uneven tapper fails on steadiness even if the average is right', () => {
    const r = evaluateTaps(taps(16, 750, 250, 9), 80)
    expect(r.steadinessPct!).toBeGreaterThan(12)
    expect(r.passed).toBe(false)
  })

  it('score falls as accuracy falls (monotonic)', () => {
    const s = [750, 720, 690, 650].map((iv) => evaluateTaps(taps(16, iv), 80).score)
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThan(s[i - 1])
  })

  it('ignores long pauses between taps', () => {
    const t = [...taps(8, 750), ...taps(9, 750).map((x) => x + 7 * 750 + 6000)]
    const r = evaluateTaps(t, 80)
    expect(r.bpm!).toBeCloseTo(80, 0)
  })
})

const beat = (beatInBar: number, o: Partial<BeatEvent> = {}): ConductingEvent => ({
  type: 'beat', index: 1, beatInBar, bar: 1, timestampMs: 0, detectedAtMs: 0, direction: 'down', intervalMs: 600, skipped: 0, resynced: false, confidence: 0.9, usedForTempo: true, ...o,
})
const off: ConductingEvent = { type: 'stroke-rejected', timestampMs: 0, reason: 'off-pattern', amplitude: 1, peakSpeed: 3, direction: 'left' }
const snap = (mark = 'mf', o: Partial<GestureSnapshot> = {}): GestureSnapshot => ({
  timestampMs: 0, state: 'conducting', timeSignature: '4/4', beatInBar: 1, expectedBeat: 2, bpm: 90, rawBpm: 90, tempoStability: 1, lastBeatConfidence: 1,
  dynamics: { level: 0.5, mark: mark as never, trend: 'steady', source: 'hand' }, rightPresent: true, leftPresent: true, rightConfidence: 1, leftConfidence: 1,
  cue: { cue: null, progress: 0 }, stats: { beatsAccepted: 0, offPattern: 0, tooSoon: 0, ignored: 0, skippedBeats: 0, resyncs: 0 }, ...o,
})

describe('PatternExercise', () => {
  const bars = (ex: PatternExercise, n: number, per: number, start = 0) => {
    let t = start
    for (let b = 0; b < n; b++) for (let i = 1; i <= per; i++) ex.feed([beat(i)], snap(), (t += 600))
    return t
  }

  it('passes after the required number of consecutive complete bars', () => {
    const ex = new PatternExercise({ timeSignature: '4/4', barsRequired: 3 })
    bars(ex, 2, 4)
    expect(ex.state).toMatchObject({ consecutiveBars: 2, passed: false })
    bars(ex, 1, 4, 10000)
    expect(ex.state).toMatchObject({ consecutiveBars: 3, passed: true, score: 100 })
  })

  it.each([['2/4', 2], ['3/4', 3], ['4/4', 4]] as const)('%s needs %i beats per bar', (ts, n) => {
    const ex = new PatternExercise({ timeSignature: ts, barsRequired: 2 })
    bars(ex, 2, n)
    expect(ex.state.passed).toBe(true)
  })

  it('an off-pattern stroke resets the run of clean bars and lowers the score', () => {
    const ex = new PatternExercise({ timeSignature: '4/4', barsRequired: 3 })
    bars(ex, 2, 4)
    ex.feed([off], snap(), 20000)
    expect(ex.state.consecutiveBars).toBe(0)
    expect(ex.state.offPattern).toBe(1)
    expect(ex.state.score).toBeLessThan(100)
    bars(ex, 3, 4, 21000)
    expect(ex.state.passed).toBe(true)
  })

  it('a missed (inferred) or re-synchronised beat breaks the bar', () => {
    const ex = new PatternExercise({ timeSignature: '4/4', barsRequired: 1 })
    ex.feed([beat(1), beat(2), beat(3, { skipped: 1 }), beat(4)], snap(), 1000)
    expect(ex.state.passed).toBe(false)
    ex.feed([beat(1), beat(2), beat(3), beat(4)], snap(), 2000)
    expect(ex.state.passed).toBe(true)
  })

  it('beats out of order do not count as a bar', () => {
    const ex = new PatternExercise({ timeSignature: '4/4', barsRequired: 1 })
    ex.feed([beat(1), beat(3), beat(2), beat(4)], snap(), 1000)
    expect(ex.state.passed).toBe(false)
  })

  it('can require the left hand at the same time (gate)', () => {
    const ex = new PatternExercise({ timeSignature: '4/4', barsRequired: 2, gate: (s) => s.dynamics.mark === 'f' || s.dynamics.mark === 'ff' })
    let t = 0
    for (let i = 0; i < 12; i++) ex.feed([beat((i % 4) + 1)], snap('mp'), (t += 600))
    expect(ex.state.passed).toBe(false) // left hand not at forte
    for (let i = 0; i < 8; i++) ex.feed([beat((i % 4) + 1)], snap('f'), (t += 600))
    expect(ex.state.passed).toBe(true)
  })

  it('reports a time-out without passing', () => {
    const ex = new PatternExercise({ timeSignature: '4/4', timeLimitMs: 5000 })
    ex.feed([beat(1)], snap(), 1000)
    ex.feed([], snap(), 9000)
    expect(ex.state.timedOut).toBe(true)
    expect(ex.state.passed).toBe(false)
  })

  it('end to end with the real gesture engine on synthetic conducting: 4/4 and 3/4 pass; a 3/4 hand in a 4/4 exercise does not', () => {
    for (const ts of ['4/4', '3/4', '2/4'] as const) {
      const ex = new PatternExercise({ timeSignature: ts, barsRequired: 3 })
      const r = simulate({ demo: { timeSignature: ts, bpm: 80 }, seconds: 30 })
      r.events.forEach((e) => ex.feed([e], r.engine.snapshot, e.timestampMs))
      expect(ex.state.passed, ts).toBe(true)
    }
    const wrong = new PatternExercise({ timeSignature: '4/4', barsRequired: 3 })
    const r = simulate({ demo: { timeSignature: '3/4', bpm: 80 }, config: { timeSignature: '4/4' }, seconds: 30, onFrame: (t, _s, e) => t === 0 && e.setTimeSignature('4/4') })
    r.events.forEach((e) => wrong.feed([e], r.engine.snapshot, e.timestampMs))
    expect(wrong.state.passed).toBe(false)
  })
})

describe('DynamicsExercise', () => {
  const hold = (ex: DynamicsExercise, mark: string, from: number, ms: number, o: Partial<GestureSnapshot> = {}) => {
    for (let t = from; t <= from + ms; t += 33) ex.feed(snap(mark, o), t)
    return from + ms
  }

  it('requires each marking to be held continuously, in order', () => {
    const ex = new DynamicsExercise({ targets: ['p', 'f'], holdMs: 1000 })
    expect(ex.state.index).toBe(0)
    let t = hold(ex, 'p', 0, 700)
    expect(ex.state.reached).toBe(0)
    expect(ex.state.holdProgress).toBeGreaterThan(0.6)
    t = hold(ex, 'p', t, 600)
    expect(ex.state).toMatchObject({ reached: 1, index: 1 })
    hold(ex, 'f', t, 1200)
    expect(ex.state).toMatchObject({ reached: 2, passed: true, score: 100 })
  })

  it('an interrupted hold restarts', () => {
    const ex = new DynamicsExercise({ targets: ['f'], holdMs: 1000 })
    let t = hold(ex, 'f', 0, 700)
    t = hold(ex, 'mf', t, 100)
    hold(ex, 'f', t, 700)
    expect(ex.state.reached).toBe(0)
  })

  it('does not count a left hand that is not actually tracked (held pose)', () => {
    const ex = new DynamicsExercise({ targets: ['f'], holdMs: 500 })
    hold(ex, 'f', 0, 2000, { leftPresent: false, dynamics: { level: 0.75, mark: 'f', trend: 'steady', source: 'hold' } })
    expect(ex.state.reached).toBe(0)
  })

  it('fails if a target is not reached in time, with partial credit', () => {
    const ex = new DynamicsExercise({ targets: ['p', 'ff'], holdMs: 500, perTargetMs: 5000 })
    let t = hold(ex, 'p', 0, 700)
    t = hold(ex, 'mf', t, 6000)
    expect(ex.state).toMatchObject({ failed: true, reached: 1, passed: false })
    expect(ex.state.score).toBe(50)
    ex.feed(snap('ff'), t + 100) // nothing more happens after failing
    expect(ex.state.reached).toBe(1)
  })

  it('end to end with the real engine: a virtual left hand stepping through the targets passes', () => {
    const targets = ['p', 'f', 'pp', 'ff'] as const
    const level = (t: number) => [0.25, 0.76, 0.08, 0.93][Math.min(3, Math.floor(t / 4))]
    const ex = new DynamicsExercise({ targets: [...targets], holdMs: 1500 })
    const r = simulate({ demo: { leftLevel: level, bpm: 90 }, config: { dynamics: DEFAULT_GESTURE_CONFIG.dynamics }, seconds: 17 })
    r.snapshots.forEach((s, i) => ex.feed(s, (i * 1000) / 30))
    expect(ex.state.passed).toBe(true)
  })
})
