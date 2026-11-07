import { DEFAULT_GESTURE_CONFIG } from './gestureConfig'
import { mergeConfig } from './settings'

describe('mergeConfig', () => {
  it('returns defaults when nothing is saved', () => {
    expect(mergeConfig(DEFAULT_GESTURE_CONFIG, undefined)).toEqual(DEFAULT_GESTURE_CONFIG)
  })
  it('applies saved overrides and keeps new defaults for missing keys', () => {
    const saved = { beat: { minAmplitude: 0.4 } }
    const out = mergeConfig(DEFAULT_GESTURE_CONFIG, saved)
    expect(out.beat.minAmplitude).toBe(0.4)
    expect(out.beat.minBeatIntervalMs).toBe(DEFAULT_GESTURE_CONFIG.beat.minBeatIntervalMs)
  })
  it('ignores saved values of the wrong type', () => {
    const out = mergeConfig(DEFAULT_GESTURE_CONFIG, { tempo: { minBpm: 'fast' } })
    expect(out.tempo.minBpm).toBe(DEFAULT_GESTURE_CONFIG.tempo.minBpm)
  })
  it('has sane, ordered defaults', () => {
    const { boundaries } = DEFAULT_GESTURE_CONFIG.dynamics
    expect([...boundaries].sort((a, b) => a - b)).toEqual(boundaries)
    expect(DEFAULT_GESTURE_CONFIG.tempo.minBpm).toBeLessThan(DEFAULT_GESTURE_CONFIG.tempo.maxBpm)
  })
})
