import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { TempoEstimator } from './tempoEstimator'

const CFG = DEFAULT_GESTURE_CONFIG.tempo
const beatsAt = (est: TempoEstimator, startMs: number, intervalMs: number, n: number, skipped = 0) => {
  let last = null
  for (let i = 0; i < n; i++) last = est.addBeat({ tMs: startMs + i * intervalMs, skipped: i === 0 ? 0 : skipped })
  return last
}

describe('TempoEstimator — interval → BPM', () => {
  it('needs two beats for the first interval', () => {
    const e = new TempoEstimator(CFG)
    expect(e.addBeat({ tMs: 0, skipped: 0 })).toBeNull()
    expect(e.state).toBeNull()
    const r = e.addBeat({ tMs: 750, skipped: 0 })
    expect(r!.state.bpm).toBeCloseTo(80)
    expect(r!.interval).toBe(750)
  })

  it.each([40, 60, 90, 120, 180])('converges on %i BPM for steady beats', (bpm) => {
    const e = new TempoEstimator(CFG)
    beatsAt(e, 0, 60000 / bpm, 12)
    expect(e.state!.bpm).toBeCloseTo(bpm, 1)
    expect(e.state!.rawBpm).toBeCloseTo(bpm, 1)
    expect(e.state!.stability).toBeCloseTo(1, 2)
  })

  it('ignores intervals outside the allowed BPM range', () => {
    const e = new TempoEstimator(CFG)
    e.addBeat({ tMs: 0, skipped: 0 })
    expect(e.addBeat({ tMs: 100, skipped: 0 })).toBeNull() // 600 BPM
    e.addBeat({ tMs: 5000, skipped: 0 }) // 12 BPM
    expect(e.state).toBeNull()
  })

  it('divides the interval across an inferred missed beat', () => {
    const e = new TempoEstimator(CFG)
    e.addBeat({ tMs: 0, skipped: 0 })
    const r = e.addBeat({ tMs: 1500, skipped: 1 })
    expect(r!.state.bpm).toBeCloseTo(80)
  })

  it('rejects a one-off outlier interval and keeps the tempo', () => {
    const e = new TempoEstimator(CFG)
    beatsAt(e, 0, 750, 8)
    const before = e.state!.bpm
    e.addBeat({ tMs: 7 * 750 + 1200, skipped: 0 }) // 1200 ms: a stumble
    expect(e.state!.bpm).toBeCloseTo(before, 0)
  })

  it('adopts a genuine tempo change after consistent evidence, in limited steps', () => {
    const e = new TempoEstimator(CFG)
    beatsAt(e, 0, 750, 8) // 80 BPM
    const bpms: number[] = []
    let t = 7 * 750
    for (let i = 0; i < 12; i++) {
      t += 500 // 120 BPM
      const r = e.addBeat({ tMs: t, skipped: 0 })
      if (r) bpms.push(r.state.bpm)
    }
    expect(e.state!.bpm).toBeGreaterThan(110)
    // each step moves no more than maxBpmStepPerBeat
    for (let i = 1; i < bpms.length; i++) expect(Math.abs(bpms[i] - bpms[i - 1])).toBeLessThanOrEqual(CFG.maxBpmStepPerBeat + 1e-6)
  })

  it('does not jump when two beats are momentarily mistimed', () => {
    const e = new TempoEstimator(CFG)
    beatsAt(e, 0, 600, 10) // 100 BPM
    const t0 = 9 * 600
    e.addBeat({ tMs: t0 + 400, skipped: 0 })
    e.addBeat({ tMs: t0 + 400 + 800, skipped: 0 })
    expect(Math.abs(e.state!.bpm - 100)).toBeLessThan(5)
  })

  it('treats a long pause as a pause, not a slower tempo', () => {
    const e = new TempoEstimator(CFG)
    beatsAt(e, 0, 600, 6)
    e.addBeat({ tMs: 5 * 600 + 1800, skipped: 0 })
    expect(e.state!.bpm).toBeCloseTo(100, 0)
  })

  it('breakChain keeps the last tempo but learns nothing across the gap', () => {
    const e = new TempoEstimator(CFG)
    beatsAt(e, 0, 600, 6)
    e.breakChain()
    expect(e.addBeat({ tMs: 20000, skipped: 0 })).toBeNull() // first beat of a new chain
    expect(e.state!.bpm).toBeCloseTo(100, 0)
    expect(e.addBeat({ tMs: 20600, skipped: 0 })!.state.bpm).toBeCloseTo(100, 0)
  })

  it('stability falls with irregular beats', () => {
    const e = new TempoEstimator(CFG)
    let t = 0
    for (const d of [600, 640, 560, 660, 540, 650, 580]) e.addBeat({ tMs: (t += d), skipped: 0 })
    const irregular = e.state!.stability!
    const steady = new TempoEstimator(CFG)
    beatsAt(steady, 0, 600, 8)
    expect(irregular).toBeLessThan(steady.state!.stability!)
    expect(irregular).toBeGreaterThanOrEqual(0)
    expect(irregular).toBeLessThan(0.9)
  })

  it('stability is null until 3 intervals', () => {
    const e = new TempoEstimator(CFG)
    beatsAt(e, 0, 600, 3)
    expect(e.state!.stability).toBeNull()
  })

  it('clamps to the configured BPM range and resets', () => {
    const e = new TempoEstimator({ ...CFG, minBpm: 60, maxBpm: 100 })
    beatsAt(e, 0, 500, 10) // 120 → rejected as out of range
    expect(e.state).toBeNull()
    e.reset()
    expect(e.intervalMs).toBeNull()
  })
})

describe('TempoEstimator — frame-quantised beat times', () => {
  const cfg = { minBpm: 40, maxBpm: 200, medianWindow: 5, smoothing: 0.5, maxBpmStepPerBeat: 14, outlierFraction: 0.35 }
  // Ictus times known only to the camera frame they fall on (83 ms at 12 fps).
  const run = (bpm: number, frameMs: number, beats = 20) => {
    const e = new TempoEstimator(cfg)
    const iv = 60000 / bpm
    let last = null as number | null
    for (let i = 0; i < beats; i++) {
      const t = Math.round((i * iv) / frameMs) * frameMs
      const r = e.addBeat({ tMs: t, skipped: 0 })
      if (r) last = r.state.bpm
    }
    return last!
  }
  it.each([55, 70, 85, 100, 115, 130])('reads %i BPM within 1.2 BPM from 12-fps beat times (a median of single intervals sat 2–3 BPM off)', (bpm) => {
    expect(Math.abs(run(bpm, 83.3) - bpm)).toBeLessThan(1.2)
  })
  it('is exact for exact beat times', () => {
    expect(run(90, 1)).toBeCloseTo(90, 0)
  })
  it('a single badly mistimed beat does not move the tempo by more than a BPM or so', () => {
    const e = new TempoEstimator(cfg)
    const iv = 666.7
    let before = 0
    let after = 0
    for (let i = 0; i < 14; i++) {
      const t = i * iv + (i === 9 ? 180 : 0)
      const r = e.addBeat({ tMs: t, skipped: 0 })
      if (i === 7 && r) before = r.state.bpm
      if (i === 13 && r) after = r.state.bpm
    }
    expect(Math.abs(after - before)).toBeLessThan(2)
  })
})
