import { frame, trackedHand } from '@/test/fixtures'
import { predictFrame, DEFAULT_MOTION } from './overlayMotion'

const at = (x: number, t: number, status: 'tracking' | 'holding' = 'tracking') => ({ ...frame({ right: { ...trackedHand('right', x, 0.5), status } }), timestampMs: t })

describe('predictFrame (smooth drawing between detections)', () => {
  it('moves a hand on along its last velocity, by the time since capture', () => {
    const p = predictFrame(at(0.5, 0), at(0.6, 100), 160) // 0.1 per 100 ms; 60 ms since capture
    expect(p.right!.palm.x).toBeCloseTo(0.6 + 0.1 * 0.6 * DEFAULT_MOTION.trust, 3)
    // every landmark moves with it (the skeleton keeps its shape)
    const d = p.right!.palm.x - 0.6
    p.right!.landmarks.forEach((lm, i) => expect(lm.x - at(0.6, 100).right!.landmarks[i].x).toBeCloseTo(d, 6))
  })
  it('never runs away: extrapolation is capped, and a long gap is not extrapolated at all', () => {
    expect(predictFrame(at(0.5, 0), at(0.6, 100), 5000).right!.palm.x).toBeLessThan(0.6 + 0.1 * (DEFAULT_MOTION.maxLeadMs / 100) + 1e-9)
    expect(predictFrame(at(0.5, 0), at(0.6, 1000), 1100).right!.palm.x).toBe(0.6)
  })
  it('does nothing for the first detection, for a held (lost) hand, or when the time has not advanced', () => {
    expect(predictFrame(null, at(0.6, 100), 160).right!.palm.x).toBe(0.6)
    expect(predictFrame(at(0.5, 0), at(0.6, 100, 'holding'), 160).right!.palm.x).toBe(0.6)
    expect(predictFrame(at(0.5, 0), at(0.6, 100), 100).right!.palm.x).toBe(0.6)
  })
  it('does not mutate the frames it is given', () => {
    const cur = at(0.6, 100)
    const before = JSON.stringify(cur)
    predictFrame(at(0.5, 0), cur, 160)
    expect(JSON.stringify(cur)).toBe(before)
  })
})
