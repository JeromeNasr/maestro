import { beatsPerBar, cosBetween, directionName, expectedStrokes, norm, unit } from './directions'

describe('directions', () => {
  it('names 8 directions in screen space (+y is down)', () => {
    expect(directionName({ x: 1, y: 0 })).toBe('right')
    expect(directionName({ x: 0, y: 1 })).toBe('down')
    expect(directionName({ x: -1, y: 0 })).toBe('left')
    expect(directionName({ x: 0, y: -1 })).toBe('up')
    expect(directionName({ x: -1, y: -1 })).toBe('up-left')
    expect(directionName({ x: 1, y: 1 })).toBe('down-right')
  })

  it('cosine handles zero vectors and parallel/opposite', () => {
    expect(cosBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0)
    expect(cosBetween({ x: 2, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(1)
    expect(cosBetween({ x: 1, y: 0 }, { x: -3, y: 0 })).toBeCloseTo(-1)
    expect(norm(unit({ x: 3, y: 4 }))).toBeCloseTo(1)
  })

  it('derives expected strokes from the teaching pattern: 2/4 down-up', () => {
    const e = expectedStrokes('2/4')
    expect(e.map(directionName)).toEqual(['down', 'up'])
  })

  it('3/4: down, right(-up), up(-left)', () => {
    expect(expectedStrokes('3/4').map(directionName)).toEqual(['down', 'up-right', 'up-left'])
  })

  it('4/4: down, left(-up), right, up(-left)', () => {
    expect(expectedStrokes('4/4').map(directionName)).toEqual(['down', 'up-left', 'right', 'up-left'])
  })

  it('has one expected stroke per beat', () => {
    for (const ts of ['2/4', '3/4', '4/4'] as const) {
      expect(expectedStrokes(ts)).toHaveLength(beatsPerBar(ts))
      expect(beatsPerBar(ts)).toBe(Number(ts[0]))
    }
  })
})
