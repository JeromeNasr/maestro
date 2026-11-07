import { markForLevel } from './dynamicsMapper'

describe('markForLevel', () => {
  it.each([
    [0, 'pp'], [0.1, 'pp'], [0.2, 'p'], [0.4, 'mp'], [0.6, 'mf'], [0.75, 'f'], [0.95, 'ff'], [1, 'ff'],
  ])('level %s → %s', (level, mark) => expect(markForLevel(level, undefined)).toBe(mark))

  it('clamps out-of-range and non-finite input', () => {
    expect(markForLevel(-5)).toBe('pp')
    expect(markForLevel(9)).toBe('ff')
    expect(markForLevel(NaN)).toBe('pp')
  })
  it('honours custom boundaries', () => {
    expect(markForLevel(0.5, [0.1, 0.2, 0.3, 0.4, 0.45])).toBe('ff')
  })
  it('is monotonic', () => {
    const order = ['pp', 'p', 'mp', 'mf', 'f', 'ff']
    let last = 0
    for (let v = 0; v <= 1; v += 0.01) {
      const i = order.indexOf(markForLevel(v))
      expect(i).toBeGreaterThanOrEqual(last)
      last = i
    }
  })
})
