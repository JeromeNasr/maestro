import { FINGERTIP_INDICES, HAND_CONNECTIONS, LANDMARK_COUNT } from './handTopology'
import { clamp, handSize, isValidLandmarks, palmCenter, toDisplay } from './geometry'
import { makeHandLandmarks } from './demoSource'

describe('hand topology', () => {
  it('describes the standard 21-landmark skeleton', () => {
    expect(LANDMARK_COUNT).toBe(21)
    expect(HAND_CONNECTIONS).toHaveLength(21)
    const used = new Set(HAND_CONNECTIONS.flat())
    expect(used.size).toBe(21)
    for (const [a, b] of HAND_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(20)
      expect(a).not.toBe(b)
    }
    expect(new Set(HAND_CONNECTIONS.map(([a, b]) => `${a}-${b}`)).size).toBe(21)
    expect(FINGERTIP_INDICES).toEqual([4, 8, 12, 16, 20])
  })
})

describe('geometry', () => {
  const lm = makeHandLandmarks(0.3, 0.6, 0.2, 'right')

  it('mirrors x only when converting raw → display, and is its own inverse', () => {
    const d = toDisplay(lm)
    expect(d[5].x).toBeCloseTo(1 - lm[5].x)
    expect(d[5].y).toBe(lm[5].y)
    expect(toDisplay(d)[7].x).toBeCloseTo(lm[7].x)
  })

  it('computes palm centre and hand size', () => {
    const c = palmCenter(lm)
    expect(c.x).toBeCloseTo(0.3)
    expect(c.y).toBeCloseTo(0.6)
    expect(handSize(lm)).toBeCloseTo(0.2, 1)
  })

  it('validates landmark arrays', () => {
    expect(isValidLandmarks(lm)).toBe(true)
    expect(isValidLandmarks(lm.slice(0, 20))).toBe(false)
    expect(isValidLandmarks(undefined)).toBe(false)
    expect(isValidLandmarks(lm.map((p, i) => (i === 3 ? { ...p, x: NaN } : p)))).toBe(false)
  })

  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})
