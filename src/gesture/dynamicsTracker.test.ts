import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { trackedHand } from '@/test/fixtures'
import { DynamicsTracker } from './dynamicsTracker'
import { handLevel } from './handLevel'

const CFG = DEFAULT_GESTURE_CONFIG.dynamics
const hand = (y: number, status: 'tracking' | 'holding' = 'tracking') => trackedHand('left', 0.25, y, status)

/** Feed a constant hand height at 30 fps for `ms`. */
function hold(t: DynamicsTracker, y: number | null, fromMs: number, ms: number, range = null as Parameters<DynamicsTracker['update']>[2]) {
  let r = t.reading
  for (let m = 0; m <= ms; m += 33) r = t.update(y === null ? null : hand(y), fromMs + m, range)
  return r
}

describe('handLevel', () => {
  it('maps high→1 and low→0 with the fallback range', () => {
    expect(handLevel(0.2, null, CFG)).toBeCloseTo(1)
    expect(handLevel(0.8, null, CFG)).toBeCloseTo(0)
    expect(handLevel(0.5, null, CFG)).toBeCloseTo(0.5)
  })
  it('clamps outside the range', () => {
    expect(handLevel(0.0, null, CFG)).toBe(1)
    expect(handLevel(1.0, null, CFG)).toBe(0)
  })
  it('uses a calibrated range when usable and ignores a degenerate one', () => {
    expect(handLevel(0.5, { highY: 0.4, lowY: 0.6 }, CFG)).toBeCloseTo(0.5)
    expect(handLevel(0.4, { highY: 0.4, lowY: 0.6 }, CFG)).toBeCloseTo(1)
    expect(handLevel(0.5, { highY: 0.5, lowY: 0.52 }, CFG)).toBeCloseTo(0.5) // degenerate → fallback
  })
})

describe('DynamicsTracker', () => {
  it('starts at the default level before the left hand is ever seen', () => {
    const t = new DynamicsTracker(CFG)
    const r = t.update(null, 0, null)
    expect(r.level).toBeCloseTo(CFG.defaultLevel)
    expect(r.source).toBe('default')
    expect(r.mark).toBe('mf')
  })

  it.each([
    [0.78, 'pp'], [0.65, 'p'], [0.55, 'mp'], [0.45, 'mf'], [0.34, 'f'], [0.25, 'ff'],
  ] as const)('hand at y=%s settles on %s', (y, mark) => {
    const t = new DynamicsTracker(CFG)
    expect(hold(t, y, 0, 3000).mark).toBe(mark)
  })

  it('glides: the level never jumps by more than a small step per frame', () => {
    const t = new DynamicsTracker(CFG)
    hold(t, 0.78, 0, 1000)
    let prev = t.reading.level
    let maxStep = 0
    for (let m = 0; m < 2000; m += 33) {
      const r = t.update(hand(0.25), 1000 + m, null)
      maxStep = Math.max(maxStep, Math.abs(r.level - prev))
      prev = r.level
    }
    expect(maxStep).toBeLessThan(0.12)
    expect(prev).toBeGreaterThan(0.85) // and it does get there
  })

  it('does not flicker between markings near a boundary (hysteresis)', () => {
    const t = new DynamicsTracker(CFG)
    hold(t, 0.5, 0, 2000) // mf
    const marks = new Set<string>()
    for (let i = 0; i < 90; i++) {
      const y = 0.5 + (i % 2 ? 0.01 : -0.01) // ±0.017 of level around the 0.5 boundary
      marks.add(t.update(hand(y), 2000 + i * 33, null).mark)
    }
    expect(marks.size).toBe(1)
  })

  it('reports crescendo while rising steadily and diminuendo while falling', () => {
    const t = new DynamicsTracker(CFG)
    hold(t, 0.75, 0, 1500)
    let r = t.reading
    for (let i = 0; i < 60; i++) r = t.update(hand(0.75 - i * 0.008), 1500 + i * 33, null) // up ≈ 0.8 level/s... 
    expect(r.trend).toBe('crescendo')
    hold(t, 0.3, 4000, 1500)
    for (let i = 0; i < 60; i++) r = t.update(hand(0.3 + i * 0.008), 6000 + i * 33, null)
    expect(r.trend).toBe('diminuendo')
    r = hold(t, 0.5, 9000, 2500)
    expect(r.trend).toBe('steady')
  })

  it('holds the last level when the left hand leaves the frame', () => {
    const t = new DynamicsTracker(CFG)
    hold(t, 0.3, 0, 3000)
    const before = t.reading.level
    const r = hold(t, null, 3000, 5000)
    expect(r.level).toBeCloseTo(before, 3)
    expect(r.source).toBe('hold')
  })

  it('a stale "holding" pose is not treated as live input', () => {
    const t = new DynamicsTracker(CFG)
    hold(t, 0.3, 0, 3000)
    const before = t.reading.level
    for (let m = 0; m < 1000; m += 33) t.update(hand(0.8, 'holding'), 3000 + m, null)
    expect(t.reading.level).toBeCloseTo(before, 3)
  })

  it('can drift back to the default level when holding is disabled', () => {
    const t = new DynamicsTracker({ ...CFG, holdWhenLeftLost: false })
    hold(t, 0.25, 0, 2000)
    const r = hold(t, null, 2000, 15000)
    expect(r.level).toBeCloseTo(CFG.defaultLevel, 1)
  })

  it('uses the calibrated range', () => {
    const t = new DynamicsTracker(CFG)
    const range = { highY: 0.4, lowY: 0.6 }
    expect(hold(t, 0.4, 0, 3000, range).mark).toBe('ff')
    t.reset()
    expect(hold(t, 0.6, 0, 3000, range).mark).toBe('pp')
  })

  it('reset restores the default', () => {
    const t = new DynamicsTracker(CFG)
    hold(t, 0.25, 0, 2000)
    t.reset()
    expect(t.reading.level).toBeCloseTo(CFG.defaultLevel)
    expect(t.reading.source).toBe('default')
  })
})
