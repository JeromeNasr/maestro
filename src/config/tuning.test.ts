import { DEFAULT_GESTURE_CONFIG } from './gestureConfig'
import { clampParam, TUNING_PARAMS } from './tuning'

describe('tuning parameters', () => {
  it('every parameter maps to a real config value, is within its own range by default, and round-trips', () => {
    expect(new Set(TUNING_PARAMS.map((p) => p.id)).size).toBe(TUNING_PARAMS.length)
    for (const p of TUNING_PARAMS) {
      const v = p.get(DEFAULT_GESTURE_CONFIG)
      expect(Number.isFinite(v), p.id).toBe(true)
      expect(v, p.id).toBeGreaterThanOrEqual(p.min)
      expect(v, p.id).toBeLessThanOrEqual(p.max)
      const changed = p.set(DEFAULT_GESTURE_CONFIG, p.min)
      expect(p.get(changed), p.id).toBe(p.min)
      expect(DEFAULT_GESTURE_CONFIG === changed).toBe(false) // immutable update
      expect(p.get(DEFAULT_GESTURE_CONFIG), p.id).toBe(v)
    }
  })

  it('clamps and snaps values to the parameter range and step', () => {
    const p = TUNING_PARAMS.find((x) => x.id === 'minAmplitude')!
    expect(clampParam(p, 99)).toBe(p.max)
    expect(clampParam(p, -4)).toBe(p.min)
    expect(clampParam(p, 0.731)).toBeCloseTo(0.75)
    expect(clampParam(p, NaN)).toBe(p.min)
  })

  it('covers beats, tempo, dynamics and cues', () => {
    expect(new Set(TUNING_PARAMS.map((p) => p.group))).toEqual(new Set(['Beats', 'Tempo', 'Dynamics', 'Cues']))
  })
})
