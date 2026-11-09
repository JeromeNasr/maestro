import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { rawHand, result, rng } from '@/test/fixtures'
import { HandPipeline } from './handPipeline'
import type { HandednessResolution } from './handedness'

const VERIFIED: HandednessResolution = { swap: false, verified: true, origin: 'calibration' }
const make = (res: HandednessResolution = VERIFIED) => new HandPipeline({ getConfig: () => DEFAULT_GESTURE_CONFIG, getHandedness: () => res })

describe('HandPipeline', () => {
  it('works in mirrored display space: a hand shown on the right of the preview has x > 0.5', () => {
    const f = make().process(result(rawHand('Right', 0.7)), 0)
    expect(f.right!.palm.x).toBeCloseTo(0.7, 1)
    expect(f.right!.landmarks).toHaveLength(21)
    expect(f.left).toBeNull()
  })

  it('applies a validated swap, and none otherwise', () => {
    const swapped = make({ swap: true, verified: true, origin: 'calibration' }).process(result(rawHand('Left', 0.7)), 0)
    expect(swapped.right).not.toBeNull()
    expect(swapped.right!.labelSource).toBe('swapped')
    const plain = make().process(result(rawHand('Left', 0.3)), 0)
    expect(plain.left).not.toBeNull()
    expect(plain.left!.labelSource).toBe('reported')
  })

  it('flags hands as unverified until handedness is verified', () => {
    const f = make({ swap: false, verified: false, origin: 'unverified-default' }).process(result(rawHand('Right', 0.7)), 0)
    expect(f.right!.handednessVerified).toBe(false)
  })

  it('tracks both hands independently', () => {
    const f = make().process(result(rawHand('Left', 0.25), rawHand('Right', 0.75)), 0)
    expect(f.left!.palm.x).toBeCloseTo(0.25, 1)
    expect(f.right!.palm.x).toBeCloseTo(0.75, 1)
    expect(f.detections).toHaveLength(2)
    expect(f.tracking.confidence).toBeCloseTo(0.95)
  })

  it('exposes wrist, palm, 5 fingertips and hand size', () => {
    const h = make().process(result(rawHand('Right', 0.7)), 0).right!
    expect(h.fingertips).toHaveLength(5)
    expect(h.wrist).toEqual(h.landmarks[0])
    expect(h.handSize).toBeGreaterThan(0.1)
  })

  it('reduces landmark jitter', () => {
    const r = rng(3)
    const p = make()
    const raw: number[] = []
    const out: number[] = []
    for (let i = 0; i < 120; i++) {
      const det = rawHand('Right', 0.7, 0.5, 0.95, r)
      raw.push(1 - det.landmarks[8].x)
      out.push(p.process(result(det), i * 33).right!.landmarks[8].x)
    }
    const sd = (a: number[]) => {
      const m = a.reduce((s, x) => s + x, 0) / a.length
      return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
    }
    expect(sd(out.slice(20))).toBeLessThan(sd(raw.slice(20)) * 0.6)
  })

  it('holds a briefly lost hand, then drops it after the grace period', () => {
    const p = make()
    p.process(result(rawHand('Right', 0.7)), 0)
    const held = p.process(result(), 100)
    expect(held.right!.status).toBe('holding')
    expect(held.tracking.right.status).toBe('holding')
    const gone = p.process(result(), 500)
    expect(gone.right).toBeNull()
    expect(gone.tracking.right.status).toBe('lost')
  })

  it('does not smear smoothing across a real loss: a returning hand starts at its new position', () => {
    const p = make()
    p.process(result(rawHand('Right', 0.8)), 0)
    p.process(result(), 600)
    const back = p.process(result(rawHand('Right', 0.6)), 633).right!
    expect(back.palm.x).toBeCloseTo(0.6, 2)
  })

  it('estimates kinematics from smoothed palm movement', () => {
    const p = make()
    let h
    for (let i = 0; i < 30; i++) h = p.process(result(rawHand('Right', 0.5 + i * 0.01)), i * 33).right!
    expect(h!.kinematics.velocity.x).toBeGreaterThan(0.1)
    expect(Math.abs(h!.kinematics.direction!)).toBeLessThan(0.5)
  })

  it('drops detections with malformed landmarks', () => {
    const bad = { ...rawHand('Right', 0.7), landmarks: rawHand('Right', 0.7).landmarks.slice(0, 10) }
    const f = make().process(result(bad), 0)
    expect(f.right).toBeNull()
    expect(f.detections).toHaveLength(0)
  })

  it('stamps frames with their source', () => {
    expect(make().process(result(), 0, 'demo').source).toBe('demo')
  })
})

describe('HandPipeline — detector glitches', () => {
  const frames = (xs: number[]) => {
    const p = make()
    return xs.map((x, i) => p.process(result(rawHand('Right', x)), i * 33).right?.palm.x ?? null)
  }
  it('a single-frame jump that returns is not tracked as movement', () => {
    const out = frames([0.7, 0.7, 0.7, 0.7, 0.1, 0.7, 0.7, 0.7])
    expect(out[0]).not.toBeNull()
    expect(out.every((x) => x === null || x > 0.6)).toBe(true) // never follows the glitch to x = 0.1
    expect(out.filter((x) => x === null).length).toBeLessThanOrEqual(1)
  })
  it('a real, sustained relocation is accepted after one frame of confirmation', () => {
    const out = frames([0.7, 0.7, 0.7, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45])
    expect(out.at(-1)!).toBeLessThan(0.55)
  })
  it('fast but plausible strokes are never rejected', () => {
    const xs = Array.from({ length: 20 }, (_, i) => 0.6 + 0.12 * Math.sin(i / 2))
    expect(frames(xs).every((x) => x !== null)).toBe(true)
  })
})
