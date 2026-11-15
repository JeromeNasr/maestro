import { layerIndex, nearestDrum, nearestSample, playbackRate, velocityGain, type HitVoice } from './sampleBank'

describe('sample selection', () => {
  const roots = [{ root: 48 }, { root: 55 }, { root: 62 }]
  it('picks the nearest recorded pitch', () => {
    expect(nearestSample(roots, 50).root).toBe(48)
    expect(nearestSample(roots, 53).root).toBe(55)
    expect(nearestSample(roots, 62).root).toBe(62)
    expect(nearestSample(roots, 30).root).toBe(48)
    expect(nearestSample(roots, 90).root).toBe(62)
  })
  it('breaks ties towards the lower root (shift up)', () => {
    expect(nearestSample([{ root: 50 }, { root: 54 }], 52).root).toBe(50)
  })
  it('playbackRate is exact equal temperament, in tune with A = 440', () => {
    expect(playbackRate(69, 69)).toBe(1)
    expect(playbackRate(81, 69)).toBeCloseTo(2, 12)
    expect(playbackRate(57, 69)).toBeCloseTo(0.5, 12)
    expect(playbackRate(70, 69)).toBeCloseTo(2 ** (1 / 12), 12)
    // A sample recorded 20 cents flat (cents = +20 corrects it up)
    expect(playbackRate(69, 69, 20)).toBeCloseTo(2 ** (20 / 1200), 12)
  })
  it('layers follow velocity', () => {
    expect([0, 0.2, 0.34, 0.6, 0.67, 1].map((v) => layerIndex(v, 3))).toEqual([0, 0, 1, 1, 2, 2])
    expect(layerIndex(0.9, 1)).toBe(0)
  })
  it('timpani: the nearest drum plays the note', () => {
    const v = (name: string, root: number | null): HitVoice => ({ name, root, cents: 0, layers: [] })
    const drums = [v('a', 40), v('b', 42), v('c', 46), v('d', 50), v('e', 55)]
    expect(nearestDrum(drums, 41).name).toBe('a')
    expect(nearestDrum(drums, 49).name).toBe('d')
    expect(nearestDrum([v('x', null)], 40).name).toBe('x')
  })
  it('velocity gain is monotonic, never silent, and tops out at 1', () => {
    let prev = -1
    for (let v = 0; v <= 1.0001; v += 0.1) {
      const g = velocityGain(v)
      expect(g).toBeGreaterThan(prev)
      prev = g
    }
    expect(velocityGain(0)).toBeGreaterThan(0)
    expect(velocityGain(1)).toBeCloseTo(1, 12)
  })
})
