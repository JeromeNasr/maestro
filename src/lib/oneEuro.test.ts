import { rng } from '@/test/fixtures'
import { OneEuroFilter } from './oneEuro'

const variance = (a: number[]) => {
  const m = a.reduce((s, x) => s + x, 0) / a.length
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length
}

describe('OneEuroFilter', () => {
  it('returns the first sample unchanged', () => {
    expect(new OneEuroFilter(1, 0).filter(0.42, 0)).toBe(0.42)
  })

  it('substantially reduces jitter on a stationary signal', () => {
    const r = rng(7)
    const f = new OneEuroFilter(1.5, 4)
    const input: number[] = []
    const output: number[] = []
    for (let i = 0; i < 300; i++) {
      const x = 0.5 + (r() - 0.5) * 0.02
      input.push(x)
      output.push(f.filter(x, i / 30))
    }
    expect(variance(output.slice(30))).toBeLessThan(variance(input.slice(30)) * 0.4)
  })

  it('follows fast movement with little lag when beta > 0 (and more lag when beta = 0)', () => {
    const lag = (beta: number) => {
      const f = new OneEuroFilter(1.5, beta)
      let out = 0
      for (let i = 0; i <= 60; i++) out = f.filter(i / 30, i / 30) // 1 unit/second ramp
      return 2 - out
    }
    expect(lag(4)).toBeLessThan(0.05)
    expect(lag(4)).toBeLessThan(lag(0))
  })

  it('ignores non-advancing timestamps', () => {
    const f = new OneEuroFilter(1, 0)
    f.filter(1, 1)
    expect(f.filter(5, 1)).toBe(1)
    expect(f.filter(5, 0.5)).toBe(1)
  })

  it('reset forgets history', () => {
    const f = new OneEuroFilter(1, 0)
    f.filter(1, 0)
    f.reset()
    expect(f.filter(9, 10)).toBe(9)
  })
})
