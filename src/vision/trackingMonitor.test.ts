import { trackedHand } from '@/test/fixtures'
import { TrackingMonitor } from './trackingMonitor'
import type { TrackedHand } from './types'

const mk = (grace = 300) => new TrackingMonitor<TrackedHand>({ graceMs: () => grace, windowFrames: 10, confidenceSmoothing: 0.5 })
const seen = (conf: number): TrackedHand => ({ ...trackedHand('right', 0.7, 0.5), confidence: conf })

describe('TrackingMonitor', () => {
  it('reports tracking while the hand is seen', () => {
    const m = mk()
    const r = m.update(0, { left: null, right: seen(0.9) })
    expect(r.right.status).toBe('tracking')
    expect(r.left.status).toBe('lost')
  })

  it('holds the last pose during the grace period, then declares the hand lost', () => {
    const m = mk(300)
    m.update(0, { left: null, right: seen(0.9) })
    const held = m.update(100, { left: null, right: null })
    expect(held.right.status).toBe('holding')
    expect(held.right.hand).not.toBeNull()
    expect(m.update(300, { left: null, right: null }).right.status).toBe('holding') // boundary inclusive
    const lost = m.update(301, { left: null, right: null })
    expect(lost.right.status).toBe('lost')
    expect(lost.right.hand).toBeNull()
  })

  it('a brief dropout recovers to tracking', () => {
    const m = mk(300)
    m.update(0, { left: null, right: seen(0.9) })
    m.update(100, { left: null, right: null })
    expect(m.update(150, { left: null, right: seen(0.9) }).right.status).toBe('tracking')
  })

  it('smooths confidence and restarts from the raw score after a real loss', () => {
    const m = mk(300)
    m.update(0, { left: null, right: seen(1) })
    expect(m.update(33, { left: null, right: seen(0.5) }).right.hand!.confidence).toBeCloseTo(0.75)
    m.update(100, { left: null, right: null })
    m.update(1000, { left: null, right: null }) // lost
    expect(m.update(1033, { left: null, right: seen(0.4) }).right.hand!.confidence).toBeCloseTo(0.4)
  })

  it('snapshot reports per-side status, lost duration, presence and overall reliability', () => {
    const m = mk(300)
    m.update(0, { left: null, right: seen(0.9) })
    m.update(33, { left: null, right: seen(0.9) })
    m.update(133, { left: null, right: null })
    const s = m.snapshot(133)
    expect(s.right.status).toBe('holding')
    expect(s.right.lostForMs).toBe(100)
    expect(s.right.presence).toBeCloseTo(2 / 3)
    expect(s.left.status).toBe('lost')
    expect(s.reliability).toBeCloseTo(2 / 3)
    expect(s.confidence).toBe(0) // nothing visible this frame
  })

  it('mean confidence covers only currently visible hands', () => {
    const m = mk()
    m.update(0, { left: seen(0.6), right: seen(1) })
    expect(m.snapshot(0).confidence).toBeCloseTo(0.8)
  })

  it('keeps a bounded rolling window', () => {
    const m = mk()
    for (let i = 0; i < 10; i++) m.update(i, { left: null, right: null })
    for (let i = 10; i < 20; i++) m.update(i, { left: null, right: seen(0.9) })
    expect(m.snapshot(19).reliability).toBe(1)
  })

  it('reset clears everything', () => {
    const m = mk()
    m.update(0, { left: null, right: seen(1) })
    m.reset()
    expect(m.snapshot(1).reliability).toBe(0)
    expect(m.update(1, { left: null, right: null }).right.status).toBe('lost')
  })
})
