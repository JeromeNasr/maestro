import type { V2 } from './directions'
import { StrokeSegmenter, type SegmenterParams, type StrokeCandidate } from './strokeSegmenter'

const P: SegmenterParams = { startSpeed: 0.5, endRatio: 0.35, turnAngleDeg: 70, maxStrokeMs: 2000 }
const DT = 33

/** Feed a polyline path moving between waypoints with a smoothstep speed profile; returns candidates found. */
function run(points: V2[], opts: { segMs: number; extraRestMs?: number } = { segMs: 500 }, seg = new StrokeSegmenter(P)) {
  const out: StrokeCandidate[] = []
  let t = 0
  let prev = points[0]
  const step = (pos: V2) => {
    const vel = { x: ((pos.x - prev.x) / DT) * 1000, y: ((pos.y - prev.y) / DT) * 1000 }
    const c = seg.update({ tMs: t, pos, vel })
    if (c) out.push(c)
    prev = pos
    t += DT
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const n = Math.round(opts.segMs / DT)
    for (let k = 1; k <= n; k++) {
      const u = k / n
      const e = u * u * (3 - 2 * u)
      step({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e })
    }
  }
  for (let k = 0; k < Math.round((opts.extraRestMs ?? 400) / DT); k++) step(prev)
  return { out, seg, endMs: t }
}

describe('StrokeSegmenter', () => {
  it('finds one stroke with the right vector, amplitude and ictus time', () => {
    const { out } = run([{ x: 0, y: 0 }, { x: 0, y: 2 }], { segMs: 500 })
    expect(out).toHaveLength(1)
    const s = out[0]
    expect(s.vector.y).toBeGreaterThan(0.99) // down
    expect(s.amplitude).toBeGreaterThan(1.5)
    expect(s.amplitude).toBeLessThan(2.05)
    expect(s.ictusMs).toBeGreaterThan(350)
    expect(s.ictusMs).toBeLessThanOrEqual(s.detectedMs)
    expect(s.peakSpeed).toBeGreaterThan(5)
    expect(s.endedBy).toBe('stop')
  })

  it('ictus time never lies after detection time', () => {
    const { out } = run([{ x: 0, y: 0 }, { x: 3, y: 0 }], { segMs: 600 })
    expect(out[0].ictusMs).toBeLessThanOrEqual(out[0].detectedMs)
    expect(out[0].amplitude).toBeGreaterThan(2.3)
  })

  it('splits continuous motion at a corner (direction change) without a stop', () => {
    // right then straight back left, never stopping: speed stays high through the turn
    const seg = new StrokeSegmenter(P)
    const out: StrokeCandidate[] = []
    let t = 0
    let x = 0
    for (let i = 0; i < 20; i++) {
      x += 0.12
      const c = seg.update({ tMs: (t += DT), pos: { x, y: 0 }, vel: { x: (0.12 / DT) * 1000, y: 0 } })
      if (c) out.push(c)
    }
    for (let i = 0; i < 12; i++) {
      x -= 0.12
      const c = seg.update({ tMs: (t += DT), pos: { x, y: 0 }, vel: { x: (-0.12 / DT) * 1000, y: 0 } })
      if (c) out.push(c)
    }
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out[0].endedBy).toBe('corner')
    expect(out[0].vector.x).toBeGreaterThan(0.99)
    expect(out[0].amplitude).toBeGreaterThan(2)
  })

  it('a 90° turn counts as a corner', () => {
    const { out } = run([{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }], { segMs: 120, extraRestMs: 800 })
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(out[0].vector.y).toBeGreaterThan(0.9)
    expect(out[1].vector.x).toBeGreaterThan(0.9)
  })

  it('does not start a stroke below the start speed (slow drift)', () => {
    const { out } = run([{ x: 0, y: 0 }, { x: 0.5, y: 0 }], { segMs: 4000 })
    expect(out).toHaveLength(0)
  })

  it('ignores the deceleration tail of a stroke instead of starting a spurious stroke', () => {
    const seg = new StrokeSegmenter(P)
    const out: StrokeCandidate[] = []
    // fast stroke then a slowly decaying tail that stays above the start speed for a while
    let t = 0
    let y = 0
    const speeds = [0.5, 2, 5, 8, 8, 5, 2.8, 2.2, 1.9, 1.6, 1.3, 1.0, 0.8, 0.6, 0.4, 0.2, 0]
    for (const v of speeds) {
      y += (v * DT) / 1000
      const c = seg.update({ tMs: (t += DT), pos: { x: 0, y }, vel: { x: 0, y: v } })
      if (c) out.push(c)
    }
    expect(out).toHaveLength(1)
  })

  it('re-arms after a dip and re-acceleration (fast alternating strokes)', () => {
    const { out } = run([{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 0, y: 0 }, { x: 0, y: 2 }, { x: 0, y: 0 }], { segMs: 300 })
    expect(out.length).toBeGreaterThanOrEqual(3)
  })

  it('splits an over-long movement at maxStrokeMs', () => {
    const seg = new StrokeSegmenter({ ...P, maxStrokeMs: 500 })
    const out: StrokeCandidate[] = []
    for (let i = 0; i < 40; i++) {
      const c = seg.update({ tMs: i * DT, pos: { x: i * 0.03, y: 0 }, vel: { x: 0.9, y: 0 } })
      if (c) out.push(c)
    }
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out[0].endedBy).toBe('timeout')
  })

  it('abort discards the stroke in progress', () => {
    const seg = new StrokeSegmenter(P)
    seg.update({ tMs: 0, pos: { x: 0, y: 0 }, vel: { x: 0, y: 3 } })
    expect(seg.active).toBe(true)
    seg.abort()
    expect(seg.active).toBe(false)
  })
})
