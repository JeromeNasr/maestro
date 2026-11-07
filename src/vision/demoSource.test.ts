import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { DemoSource } from './demoSource'
import { HandPipeline } from './handPipeline'

describe('DemoSource (synthetic)', () => {
  const demo = new DemoSource()

  it('produces two hands of 21 valid landmarks inside the frame', () => {
    const r = demo.detect(1000)
    expect(r.hands).toHaveLength(2)
    for (const h of r.hands) {
      expect(h.landmarks).toHaveLength(21)
      for (const p of h.landmarks) {
        expect(p.x).toBeGreaterThan(0)
        expect(p.x).toBeLessThan(1)
        expect(p.y).toBeGreaterThan(0)
        expect(p.y).toBeLessThan(1)
      }
    }
  })

  it('places the right hand on the right of the mirrored preview (raw x is flipped)', () => {
    const r = demo.detect(1000)
    const right = r.hands.find((h) => h.label === 'Right')!
    const left = r.hands.find((h) => h.label === 'Left')!
    expect(1 - right.landmarks[9].x).toBeGreaterThan(0.5)
    expect(1 - left.landmarks[9].x).toBeLessThan(0.5)
  })

  it('moves the right hand through a down-first conducting pattern', () => {
    const beat = 60 / 72
    const ys = [0, 1, 2, 3].map((b) => demo.palmAt('right', b * beat).y)
    expect(ys[0]).toBeGreaterThan(ys[3]) // beat 1 (down) is lower on screen than beat 4 (up)
    const xs = [1, 2].map((b) => demo.palmAt('right', b * beat).x)
    expect(xs[0]).toBeLessThan(xs[1]) // beat 2 left of beat 3
  })

  it('moves the left hand vertically (dynamics demonstration)', () => {
    const ys = [0, 2, 4, 6].map((t) => demo.palmAt('left', t).y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.2)
  })

  it('briefly drops the right hand to demonstrate loss handling', () => {
    expect(demo.detect(6050).hands.map((h) => h.label)).toEqual(['Left'])
    expect(demo.detect(13500).hands.map((h) => h.label)).toEqual(['Left'])
    expect(demo.detect(20050).hands).toHaveLength(2)
  })

  it('runs through the real pipeline: a short dropout is held, a long one is lost, then recovered', () => {
    const p = new HandPipeline({ getConfig: () => DEFAULT_GESTURE_CONFIG, getHandedness: () => ({ swap: false, verified: true, origin: 'demo' }) })
    const at = (ms: number) => p.process(demo.detect(ms), ms, 'demo')
    for (let t = 0; t < 5990; t += 33) at(t)
    expect(at(5990).right!.status).toBe('tracking')
    expect(at(6033).right!.status).toBe('holding') // 0.15 s dropout (6000–6150 ms) is within the 300 ms grace period
    expect(at(6100).left!.status).toBe('tracking') // the other hand is unaffected
    expect(at(6200).right!.status).toBe('tracking') // recovered
    for (let t = 6233; t < 13000; t += 33) at(t)
    expect(at(13100).right!.status).toBe('holding')
    expect(at(13500).right).toBeNull() // 0.9 s dropout (13000–13900 ms) exceeds the grace period
    expect(at(14000).right!.status).toBe('tracking')
  })
})

describe('DemoSource framing', () => {
  it('keeps every landmark of both hands inside the frame throughout the loop', () => {
    const demo = new DemoSource()
    for (let ms = 0; ms < 20000; ms += 50) {
      for (const h of demo.detect(ms).hands) {
        for (const p of h.landmarks) {
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThanOrEqual(1)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})
