import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { simulate } from '@/test/conductorSim'

const on = { baton: { ...DEFAULT_GESTURE_CONFIG.baton, enabled: true } }
const outOfOrder = (beats: { beatInBar: number }[], n: number) => beats.map((b) => b.beatInBar).filter((b, i, a) => i > 0 && b !== (a[i - 1] % n) + 1).length

describe('baton tip as the beat source', () => {
  it('a baton that moves like a conducting tip gives accurate beats and tempo, in order', () => {
    for (const bpm of [70, 100, 130]) {
      const r = simulate({ demo: { bpm, timeSignature: '4/4', style: 'flowing', baton: true, noise: 0.004 }, seconds: 30, config: on })
      expect(r.beats.length, `${bpm}`).toBeGreaterThan(30 * (bpm / 60) * 0.85)
      expect(outOfOrder(r.beats, 4), `${bpm}`).toBe(0)
      expect(Math.abs((r.tempos.at(-1)?.bpm ?? 0) - bpm), `${bpm}`).toBeLessThan(2.5)
    }
  })
  it('keeps conducting when the HAND is lost but the baton is still seen (a fist round the stick confuses the hand model)', () => {
    const r = simulate({ demo: { bpm: 90, timeSignature: '4/4', style: 'flowing', baton: true, visible: (s) => s === 'left', batonVisible: () => true, noise: 0.004 }, seconds: 30, config: on })
    expect(r.beats.length).toBeGreaterThan(30 * 1.5 * 0.8)
    expect(Math.abs((r.tempos.at(-1)?.bpm ?? 0) - 90)).toBeLessThan(2.5)
    expect(r.engine.snapshot.state).toBe('conducting')
  })
  it('switched off, the tip is ignored: with the hand lost there is nothing to follow', () => {
    const r = simulate({ demo: { bpm: 90, baton: true, visible: () => false, batonVisible: () => true }, seconds: 15 })
    expect(r.beats).toHaveLength(0)
  })
  it('"use for beats" off: the hand conducts as before even though a baton is tracked', () => {
    const cfg = { baton: { ...on.baton, useForBeats: false }, beat: { ...DEFAULT_GESTURE_CONFIG.beat, loneHandConducts: false } }
    const r = simulate({ demo: { bpm: 90, baton: true, visible: (s) => s === 'left', batonVisible: () => true }, seconds: 15, config: cfg })
    expect(r.beats).toHaveLength(0)
  })
  it('when the baton disappears, conducting falls back to the hand without losing the tempo', () => {
    const r = simulate({ demo: { bpm: 90, timeSignature: '4/4', style: 'flowing', baton: true, batonVisible: (t) => t < 12 || t > 18, noise: 0.004 }, seconds: 36, config: on })
    expect(Math.abs((r.tempos.at(-1)?.bpm ?? 0) - 90)).toBeLessThan(3)
    expect(r.beats.filter((b) => b.timestampMs > 20000).length).toBeGreaterThan(16 * 1.5 * 0.8)
  })
  it('the tip lets even a small hand movement register, because the tip travels further (lever arm)', () => {
    const small = simulate({ demo: { bpm: 90, scale: 0.25, baton: true, noise: 0.003 }, seconds: 25 })
    const tip = simulate({ demo: { bpm: 90, scale: 0.25, baton: true, noise: 0.003 }, seconds: 25, config: on })
    expect(tip.beats.length).toBeGreaterThan(small.beats.length + 10) // measured: 1 beat from the hand vs 18 from the tip, of ~37
  })
})
