import { effectiveHandedness, resolveSides, type HandednessResolution } from './handedness'

const AS_REPORTED: HandednessResolution = { swap: false, verified: true, origin: 'calibration' }
const SWAPPED: HandednessResolution = { swap: true, verified: true, origin: 'calibration' }
const c = (label: 'Left' | 'Right', x: number, score = 0.9) => ({ label, score, palm: { x, y: 0.5 } })

describe('effectiveHandedness', () => {
  it("applies NO correction in auto mode until calibration has verified one", () => {
    expect(effectiveHandedness('auto', null)).toEqual({ swap: false, verified: false, origin: 'unverified-default' })
  })
  it('uses the calibrated result in auto mode', () => {
    expect(effectiveHandedness('auto', { swap: true })).toMatchObject({ swap: true, verified: true, origin: 'calibration' })
    expect(effectiveHandedness('auto', { swap: false })).toMatchObject({ swap: false, verified: true })
  })
  it('honours explicit user overrides regardless of calibration', () => {
    expect(effectiveHandedness('as-reported', { swap: true })).toMatchObject({ swap: false, origin: 'user-as-reported' })
    expect(effectiveHandedness('swapped', null)).toMatchObject({ swap: true, origin: 'user-swapped' })
  })
})

describe('resolveSides', () => {
  it('returns nothing for no hands', () => {
    expect(resolveSides([], AS_REPORTED)).toEqual({ left: null, right: null })
  })
  it('maps a single hand by its label', () => {
    const r = resolveSides([c('Right', 0.8)], AS_REPORTED)
    expect(r.right?.candidate.palm.x).toBe(0.8)
    expect(r.left).toBeNull()
    expect(r.right?.source).toBe('reported')
  })
  it('swaps labels when the validated resolution says so', () => {
    const r = resolveSides([c('Right', 0.2)], SWAPPED)
    expect(r.left).not.toBeNull()
    expect(r.right).toBeNull()
    expect(r.left?.source).toBe('swapped')
  })
  it('keeps both labels when they are distinct', () => {
    const r = resolveSides([c('Left', 0.8), c('Right', 0.2)], AS_REPORTED)
    expect(r.left?.candidate.palm.x).toBe(0.8) // trusts labels, not position, when they are consistent
    expect(r.right?.candidate.palm.x).toBe(0.2)
  })
  it('falls back to screen position when two hands get the same label', () => {
    const r = resolveSides([c('Left', 0.7), c('Left', 0.3)], AS_REPORTED)
    expect(r.left?.candidate.palm.x).toBe(0.3)
    expect(r.right?.candidate.palm.x).toBe(0.7)
    expect(r.left?.source).toBe('positional')
    expect(r.right?.source).toBe('positional')
  })
  it('keeps only the two highest-scoring hands', () => {
    const r = resolveSides([c('Left', 0.1, 0.5), c('Left', 0.4, 0.99), c('Right', 0.8, 0.9)], AS_REPORTED)
    expect(r.left?.candidate.palm.x).toBe(0.4)
    expect(r.right?.candidate.palm.x).toBe(0.8)
  })
})
