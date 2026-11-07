import { positionAt, TEACHING_PATTERNS } from './patternGeometry'

describe('teaching patterns', () => {
  it('have the specified stroke order', () => {
    expect(TEACHING_PATTERNS['2/4'].strokes).toEqual(['Down', 'Up'])
    expect(TEACHING_PATTERNS['3/4'].strokes).toEqual(['Down', 'Right', 'Up'])
    expect(TEACHING_PATTERNS['4/4'].strokes).toEqual(['Down', 'Left', 'Right', 'Up'])
  })
  it('have one ictus per beat', () => {
    for (const p of Object.values(TEACHING_PATTERNS)) {
      expect(p.ictus).toHaveLength(p.strokes.length)
      expect(p.ictus).toHaveLength(Number(p.timeSignature[0]))
    }
  })
  it('4/4 ictus geometry matches directions (beat 2 left of beat 3; beat 1 lowest)', () => {
    const [b1, b2, b3, b4] = TEACHING_PATTERNS['4/4'].ictus
    expect(b2.x).toBeLessThan(b3.x)
    expect(b1.y).toBeGreaterThan(b4.y) // y grows downward
  })
})

describe('positionAt', () => {
  it('sits exactly on each ictus at integer beats', () => {
    for (const p of Object.values(TEACHING_PATTERNS)) {
      p.ictus.forEach((pt, k) => {
        const r = positionAt(p, k)
        expect(r.point.x).toBeCloseTo(pt.x)
        expect(r.point.y).toBeCloseTo(pt.y)
        expect(r.beat).toBe(k)
      })
    }
  })
  it('wraps around the bar and handles negative beats', () => {
    const p = TEACHING_PATTERNS['3/4']
    expect(positionAt(p, 3).point).toEqual(positionAt(p, 0).point)
    expect(positionAt(p, -1).beat).toBe(2)
  })
  it('moves between ictus points monotonically along the segment midpoint', () => {
    const p = TEACHING_PATTERNS['2/4']
    const mid = positionAt(p, 0.5).point
    expect(mid.y).toBeCloseTo(50)
  })
})
