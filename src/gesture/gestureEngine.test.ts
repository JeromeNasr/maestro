import { DEFAULT_GESTURE_CONFIG, type TimeSignature } from '@/config/gestureConfig'
import { rng } from '@/test/fixtures'
import { simulate, type SimResult } from '@/test/conductorSim'

const perBar = (ts: TimeSignature) => Number(ts[0])
const outOfOrder = (r: SimResult, ts: TimeSignature) => {
  const n = perBar(ts)
  const seq = r.beats.map((b) => b.beatInBar)
  return seq.filter((b, i) => i > 0 && b !== (seq[i - 1] % n) + 1).length
}
const lastBpm = (r: SimResult) => r.tempos.at(-1)?.bpm ?? NaN

/** A hand that wanders between random targets with smooth strokes (not a conducting pattern). */
function randomWave(seed: number, seconds: number, segMin = 0.35, segMax = 0.9) {
  const r = rng(seed)
  const pts: { t: number; x: number; y: number }[] = [{ t: 0, x: 0.7, y: 0.5 }]
  while (pts.at(-1)!.t < seconds + 2) {
    const last = pts.at(-1)!
    pts.push({ t: last.t + segMin + r() * (segMax - segMin), x: 0.55 + r() * 0.35, y: 0.35 + r() * 0.35 })
  }
  return (t: number) => {
    let i = 0
    while (i < pts.length - 2 && pts[i + 1].t < t) i++
    const a = pts[i]
    const b = pts[i + 1]
    const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))
    const e = u * u * (3 - 2 * u)
    return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e }
  }
}

describe('GestureEngine — conducting patterns (synthetic trajectories through the real vision pipeline)', () => {
  const cases = (['2/4', '3/4', '4/4'] as const).flatMap((ts) => (['bounce', 'flowing'] as const).flatMap((style) => [60, 90, 120].map((bpm) => [ts, style, bpm] as const)))

  it.each(cases)('%s %s at %i BPM: beats in order, tempo within 4%%', (ts, style, bpm) => {
    const r = simulate({ demo: { timeSignature: ts, style, bpm, noise: 0.003 }, seconds: 24 })
    expect(r.beats[0].beatInBar).toBe(1) // starts on a downbeat
    expect(outOfOrder(r, ts)).toBe(0)
    expect(r.beats.length).toBeGreaterThan(((24 * bpm) / 60) * 0.7)
    expect(Math.abs(lastBpm(r) - bpm) / bpm).toBeLessThan(0.04)
    expect(r.engine.snapshot.state).toBe('conducting')
    expect(r.engine.snapshot.tempoStability).toBeGreaterThan(0.5)
  })

  it('reports bars, beat directions and sensible confidence on each beat', () => {
    const r = simulate({ demo: { timeSignature: '4/4', bpm: 80, noise: 0.002 }, seconds: 16 })
    expect(r.beats[0].direction).toBe('down')
    for (const b of r.beats) {
      expect(b.confidence).toBeGreaterThan(0)
      expect(b.confidence).toBeLessThanOrEqual(1)
      expect(b.beatInBar).toBeGreaterThanOrEqual(1)
      expect(b.beatInBar).toBeLessThanOrEqual(4)
      expect(b.timestampMs).toBeLessThanOrEqual(b.detectedAtMs)
    }
    const downbeats = r.beats.filter((b) => b.beatInBar === 1)
    expect(downbeats.map((b) => b.bar)).toEqual(downbeats.map((_, i) => i + 1))
    expect(r.beats.filter((b) => b.usedForTempo).length / r.beats.length).toBeGreaterThan(0.9)
  })

  it('ictus timing is consistent with the true beat times (bounce style)', () => {
    const bpm = 80
    const period = 60000 / bpm
    const r = simulate({ demo: { timeSignature: '4/4', bpm, noise: 0.002 }, seconds: 24 })
    const errs = r.beats.map((b) => {
      const phase = (b.timestampMs % period) / period
      return (phase > 0.5 ? phase - 1 : phase) * period
    })
    const med = [...errs].sort((a, b) => a - b)[errs.length >> 1]
    const sd = Math.sqrt(errs.reduce((s, e) => s + (e - med) ** 2, 0) / errs.length)
    expect(Math.abs(med)).toBeLessThan(250) // a steady processing delay is fine — tempo-following does not need phase
    expect(sd).toBeLessThan(60) // but it must be consistent
  })

  it('detects beats at 15, 30 and 60 fps', () => {
    for (const fps of [15, 30, 60]) {
      const r = simulate({ demo: { timeSignature: '4/4', bpm: 80, noise: 0.002 }, seconds: 20, fps })
      expect(r.beats.length, `${fps} fps`).toBeGreaterThan(20)
      expect(outOfOrder(r, '4/4'), `${fps} fps`).toBeLessThanOrEqual(1)
      expect(Math.abs(lastBpm(r) - 80), `${fps} fps`).toBeLessThan(5)
    }
  })

  it('is deterministic', () => {
    const run = () => simulate({ demo: { bpm: 90, noise: 0.003, seed: 4 }, seconds: 12 }).events.map((e) => JSON.stringify(e))
    expect(run()).toEqual(run())
  })
})

describe('GestureEngine — tempo changes', () => {
  it('follows a sudden change 80 → 110 BPM in bounded steps', () => {
    const r = simulate({ demo: { bpm: (t) => (t < 10 ? 80 : 110), noise: 0.002 }, seconds: 28 })
    expect(Math.abs(lastBpm(r) - 110) / 110).toBeLessThan(0.05)
    const bpms = r.tempos.map((t) => t.bpm)
    for (let i = 1; i < bpms.length; i++) expect(Math.abs(bpms[i] - bpms[i - 1])).toBeLessThanOrEqual(DEFAULT_GESTURE_CONFIG.tempo.maxBpmStepPerBeat + 1e-6)
    expect(Math.max(...bpms)).toBeLessThan(115) // no overshoot
    expect(outOfOrder(r, '4/4')).toBe(0)
  })

  it('tracks an accelerando (70 → 110 over 20 s) and a ritardando', () => {
    const acc = simulate({ demo: { bpm: (t) => 70 + 2 * Math.min(t, 20), noise: 0.002 }, seconds: 24 })
    expect(lastBpm(acc)).toBeGreaterThan(100)
    expect(lastBpm(acc)).toBeLessThan(118)
    const rit = simulate({ demo: { bpm: (t) => 110 - 2 * Math.min(t, 20), noise: 0.002 }, seconds: 24 })
    expect(lastBpm(rit)).toBeLessThan(82)
    expect(lastBpm(rit)).toBeGreaterThan(65)
    // monotone trend (allowing small wobble)
    const b = acc.tempos.map((t) => t.bpm)
    expect(b.at(-1)! - b[0]).toBeGreaterThan(20)
  })

  it('a single mistimed stroke does not jolt the tempo', () => {
    // one beat is "late" by 250 ms (the whole pattern shifts) — modelled by a brief BPM dip
    const r = simulate({ demo: { bpm: (t) => (t > 9 && t < 9.5 ? 35 : 90), noise: 0.002 }, seconds: 20 })
    const bpms = r.tempos.map((t) => t.bpm)
    expect(Math.max(...bpms) - Math.min(...bpms.slice(2))).toBeLessThan(12)
  })
})

describe('GestureEngine — left-hand dynamics', () => {
  it('maps hand height to pp…ff, smoothly', () => {
    const levels: [number, number][] = [[0, 0.08], [6, 0.25], [12, 0.42], [18, 0.58], [24, 0.76], [30, 0.93]]
    const level = (t: number) => levels.filter(([s]) => t >= s).at(-1)![1]
    const r = simulate({ demo: { leftLevel: level, bpm: 90 }, seconds: 36 })
    const marks = r.snapshots.filter((_, i) => i % 30 === 29).map((s) => s.dynamics.mark)
    // dwell near the end of each 8 s plateau
    const at = (sec: number) => r.snapshots[Math.round(sec * 30)].dynamics.mark
    expect([at(5.8), at(11.8), at(17.8), at(23.8), at(29.8), at(35.5)]).toEqual(['pp', 'p', 'mp', 'mf', 'f', 'ff'])
    expect(marks.length).toBeGreaterThan(10)
    const lv = r.snapshots.map((s) => s.dynamics.level)
    for (let i = 1; i < lv.length; i++) expect(Math.abs(lv[i] - lv[i - 1])).toBeLessThan(0.12) // no abrupt jumps
  })

  it('emits dynamics events on marking and trend changes, with crescendo/diminuendo', () => {
    const up = (t: number) => (t < 4 ? 0.2 : t < 8 ? 0.2 + ((t - 4) / 4) * 0.7 : 0.9)
    const r = simulate({ demo: { leftLevel: up, bpm: 90 }, seconds: 20 })
    const dyn = r.events.filter((e) => e.type === 'dynamics')
    expect(dyn.some((e) => e.type === 'dynamics' && e.trend === 'crescendo')).toBe(true)
    const marks = dyn.map((e) => (e.type === 'dynamics' ? e.mark : ''))
    expect(marks).toContain('ff')
    const down = simulate({ demo: { leftLevel: (t) => (t < 4 ? 0.9 : 0.9 - Math.min(1, (t - 4) / 4) * 0.7), bpm: 90 }, seconds: 20 })
    expect(down.events.some((e) => e.type === 'dynamics' && e.trend === 'diminuendo')).toBe(true)
  })

  it('left and right hands are independent', () => {
    const base = simulate({ demo: { leftLevel: 0.5, bpm: 90 }, seconds: 20 })
    const wild = simulate({ demo: { leftLevel: (t) => 0.5 + 0.45 * Math.sin(t * 3), bpm: 90 }, seconds: 20 })
    expect(wild.beats.length).toBe(base.beats.length)
    expect(lastBpm(wild)).toBeCloseTo(lastBpm(base), 1)
    // and a conducting right hand does not move dynamics when the left hand is absent
    const noLeft = simulate({ demo: { bpm: 90, visible: (s) => s === 'right' }, seconds: 10 })
    expect(noLeft.engine.snapshot.dynamics.source).toBe('default')
    expect(noLeft.engine.snapshot.dynamics.level).toBeCloseTo(DEFAULT_GESTURE_CONFIG.dynamics.defaultLevel, 2)
  })

  it('left-hand movement alone never produces beats', () => {
    const r = simulate({ demo: { visible: (s) => s === 'left', leftLevel: (t) => 0.5 + 0.45 * Math.sin(t * 4) }, seconds: 20 })
    expect(r.beats).toHaveLength(0)
    expect(r.engine.snapshot.state).toBe('no-hand')
  })

  it('keeps the last dynamic when the left hand leaves the frame', () => {
    const r = simulate({ demo: { leftLevel: 0.9, bpm: 90, visible: (s, t) => s === 'right' || t < 6 }, seconds: 16 })
    expect(r.engine.snapshot.dynamics.source).toBe('hold')
    expect(r.engine.snapshot.dynamics.mark).toBe('ff')
  })
})

describe('GestureEngine — tracking loss, disappearance and recovery', () => {
  it('survives a brief dropout (0.2 s) with the tempo and pattern intact', () => {
    const r = simulate({ demo: { bpm: 90, noise: 0.002, visible: (s, t) => !(s === 'right' && t > 8 && t < 8.2) }, seconds: 24 })
    expect(Math.abs(lastBpm(r) - 90)).toBeLessThan(5)
    expect(outOfOrder(r, '4/4')).toBeLessThanOrEqual(1)
    expect(r.engine.snapshot.state).toBe('conducting')
  })

  it('a long loss (3 s) holds the tempo, reports tracking-lost, then re-syncs on the next downbeat', () => {
    const r = simulate({ demo: { bpm: 90, noise: 0.002, visible: (s, t) => !(s === 'right' && t > 8 && t < 11) }, seconds: 26 })
    const states = r.events.filter((e) => e.type === 'state').map((e) => (e.type === 'state' ? e.state : ''))
    expect(states).toContain('tracking-lost')
    const lostAt = r.events.find((e) => e.type === 'state' && e.state === 'tracking-lost')!.timestampMs
    // after recovery: first accepted beat is a downbeat (pattern restarts), tempo recovers
    const after = r.beats.filter((b) => b.timestampMs > 11000)
    expect(lostAt).toBeLessThan(10000)
    expect(after[0].beatInBar).toBe(1)
    expect(Math.abs(lastBpm(r) - 90)).toBeLessThan(5)
    expect(r.engine.snapshot.state).toBe('conducting')
    // the tempo never collapsed during the loss
    const during = r.tempos.filter((t) => t.timestampMs > 8000 && t.timestampMs < 11000)
    expect(during).toHaveLength(0)
  })

  it('both hands disappearing: no input state, no cues, dynamics held, no crash', () => {
    const r = simulate({ demo: { bpm: 90, leftLevel: 0.9, visible: (_s, t) => t < 8 }, seconds: 20 })
    expect(r.engine.snapshot.state).toBe('no-hand')
    expect(r.engine.snapshot.dynamics.mark).toBe('ff')
    expect(r.events.filter((e) => e.type === 'cue')).toHaveLength(0)
  })

  it('a hand frozen in a stale "holding" pose is not read as a stop or a beat', () => {
    // right hand disappears mid-stroke: the pipeline holds its last pose (velocity 0) for 300 ms
    const r = simulate({ demo: { bpm: 90, visible: (s, t) => !(s === 'right' && t > 8.3 && t < 12) }, seconds: 20 })
    const bad = r.beats.filter((b) => b.timestampMs > 8300 && b.timestampMs < 8700)
    expect(bad.length).toBeLessThanOrEqual(1)
  })

  it('recovers after repeated dropouts', () => {
    const r = simulate({ demo: { bpm: 80, noise: 0.002, visible: (s, t) => !(s === 'right' && [5, 10, 15].some((s0) => t > s0 && t < s0 + 0.6)) }, seconds: 30 })
    expect(Math.abs(lastBpm(r) - 80)).toBeLessThan(6)
    expect(r.engine.snapshot.state).toBe('conducting')
  })
})

describe('GestureEngine — false gestures are not beats', () => {
  it('a motionless hand with landmark jitter produces nothing', () => {
    const r = simulate({ demo: { paths: { right: () => ({ x: 0.7, y: 0.5 }) }, noise: 0.012 }, seconds: 20 })
    expect(r.beats).toHaveLength(0)
    expect(r.tempos).toHaveLength(0)
  })

  it('slow drifting across the frame produces nothing', () => {
    const r = simulate({ demo: { paths: { right: (t) => ({ x: 0.55 + 0.01 * t, y: 0.5 + 0.005 * t }) }, noise: 0.003 }, seconds: 20 })
    expect(r.beats).toHaveLength(0)
  })

  it('small fast tremor (hand shaking) produces nothing', () => {
    const r = simulate({ demo: { paths: { right: (t) => ({ x: 0.7 + 0.012 * Math.sin(t * 40), y: 0.5 + 0.012 * Math.cos(t * 33) }) } }, seconds: 20 })
    expect(r.beats).toHaveLength(0)
  })

  it('a single flick yields at most one beat and no tempo', () => {
    const r = simulate({ demo: { paths: { right: (t) => ({ x: 0.7, y: t < 5 ? 0.35 : t < 5.5 ? 0.35 + ((t - 5) / 0.5) * 0.3 : 0.65 }) } }, seconds: 12 })
    expect(r.beats.length).toBeLessThanOrEqual(1)
    expect(r.tempos).toHaveLength(0)
  })

  it('random waving rarely forms a beat chain, and almost never moves the tempo', () => {
    let tempoEvents = 0
    let beats = 0
    for (let seed = 1; seed <= 8; seed++) {
      const r = simulate({ demo: { paths: { right: randomWave(seed, 30) } }, seconds: 30 })
      tempoEvents += r.tempos.length
      beats += r.beats.length
      expect(r.engine.snapshot.stats.offPattern, `seed ${seed}`).toBeGreaterThan(0) // it WAS seen as movement, and refused
    }
    expect(tempoEvents).toBeLessThan(20) // 8 runs × 30 s of vigorous waving (≈1 per 12 s at worst; a real conductor yields ~1 per beat)
    expect(beats).toBeLessThan(8 * 30 * 1.5)
  })

  it('conducting the wrong pattern (4/4 hand, 3/4 engine) is flagged off-pattern rather than trusted', () => {
    const r = simulate({ demo: { timeSignature: '4/4', bpm: 90 }, seconds: 20, onFrame: (t, _s, e) => t === 0 && e.setTimeSignature('3/4') })
    expect(r.engine.snapshot.timeSignature).toBe('3/4')
    expect(Math.max(...r.beats.map((b) => b.beatInBar))).toBeLessThanOrEqual(3) // never reports a beat 4 in 3/4
    // the engine does not pretend the hand matches: it re-syncs / rejects rather than reporting a clean pattern
    const s = r.engine.snapshot.stats
    expect(s.offPattern + s.resyncs + s.skippedBeats).toBeGreaterThan(0)
  })
})

describe('GestureEngine — configuration, sensitivity and time signature', () => {
  it('a small but regular gesture (40–60 % size) is adopted automatically after a few strokes', () => {
    for (const scale of [0.4, 0.5, 0.6]) {
      const r = simulate({ demo: { timeSignature: '4/4', bpm: 90, scale, style: 'flowing', noise: 0.004 }, seconds: 30 })
      expect(r.beats.length, `scale ${scale}`).toBeGreaterThan(30) // of ~45 (the first strokes are the evidence the threshold adapts to)
      expect(Math.abs(lastBpm(r) - 90), `scale ${scale}`).toBeLessThan(4)
      expect(outOfOrder(r, '4/4'), `scale ${scale}`).toBe(0)
    }
  })

  it('a gesture below the tremor floor (≈ 25 %) is still ignored, unless sensitivity is raised', () => {
    const tiny = { timeSignature: '4/4' as const, bpm: 90, scale: 0.25 }
    expect(simulate({ demo: tiny, seconds: 20 }).beats.length).toBeLessThan(5)
    const hi = simulate({ demo: tiny, config: { tracking: { ...DEFAULT_GESTURE_CONFIG.tracking, sensitivity: 3 } }, seconds: 20 })
    expect(hi.beats.length).toBeGreaterThan(10)
  })

  it('the small-gesture adaptation does not make random waving count: small irregular movement produces no beats and no tempo', () => {
    let leaks = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const wave = randomWave(seed, 60, 0.3, 0.8)
      // shrink the wander to a small region so its strokes are in the "small gesture" amplitude range
      const small = (t: number) => {
        const p = wave(t)
        return { x: 0.72 + (p.x - 0.72) * 0.22, y: 0.5 + (p.y - 0.5) * 0.3 }
      }
      const r = simulate({ demo: { paths: { right: small }, noise: 0.003 }, seconds: 60 })
      leaks += r.tempos.length
    }
    // Measured: 2 tempo events in 6 × 60 s of small random waving with the adaptation (0 without it); large random waving gives
    // ~19–20 either way. Beats can still appear, tempo (what changes the music) almost never.
    expect(leaks).toBeLessThanOrEqual(3)
  })

  it('thresholds are configurable: a larger minimum amplitude rejects normal strokes as too small', () => {
    const r = simulate({ demo: { bpm: 90 }, config: { beat: { ...DEFAULT_GESTURE_CONFIG.beat, minAmplitude: 5 } }, seconds: 12 })
    expect(r.beats).toHaveLength(0)
    expect(r.events.some((e) => e.type === 'stroke-rejected' && e.reason === 'too-small')).toBe(false) // below 0.5×min: not even reported
  })

  it('switching the time signature at runtime restarts the pattern at the downbeat', () => {
    const r = simulate({
      demo: { timeSignature: '3/4', bpm: 90 },
      seconds: 24,
      onFrame: (t, _src, engine) => {
        if (t === 0) engine.setTimeSignature('4/4')
        if (t === 10000) engine.setTimeSignature('3/4')
      },
    })
    const afterSwitch = r.beats.filter((b) => b.detectedAtMs >= 10000)
    expect(afterSwitch[0].beatInBar).toBe(1) // the pattern restarted at a downbeat
    const late = r.beats.filter((b) => b.timestampMs > 12000)
    expect(late.length).toBeGreaterThan(10)
    expect(Math.max(...late.map((b) => b.beatInBar))).toBe(3)
    expect(r.engine.snapshot.timeSignature).toBe('3/4')
  })

  it('exposes the expected next beat and a coherent snapshot', () => {
    const r = simulate({ demo: { bpm: 90 }, seconds: 10 })
    const s = r.engine.snapshot
    expect(s.expectedBeat).toBe(((s.beatInBar ?? 0) % 4) + 1)
    expect(s.bpm).toBeGreaterThan(80)
    expect(s.rightPresent).toBe(true)
    expect(s.leftPresent).toBe(true)
    expect(s.stats.beatsAccepted).toBe(r.beats.length)
  })

  it('reset clears all conducting state', () => {
    const r = simulate({ demo: { bpm: 90 }, seconds: 10 })
    r.engine.reset()
    const s = r.engine.snapshot
    expect(s.bpm).toBeNull()
    expect(s.beatInBar).toBeNull()
    expect(s.stats.beatsAccepted).toBe(0)
    expect(s.state).toBe('no-hand')
  })
})

describe('GestureEngine — cues versus conducting', () => {
  const still = { right: () => ({ x: 0.75, y: 0.3 }), left: () => ({ x: 0.25, y: 0.3 }) }

  it('both hands raised and held starts a stopped piece (via the full pipeline)', () => {
    const r = simulate({ demo: { paths: still }, seconds: 3, transport: 'stopped' })
    expect(r.events.filter((e) => e.type === 'cue').map((e) => (e.type === 'cue' ? e.cue : ''))).toEqual(['start'])
  })

  it('both hands lowered and held stops a playing piece', () => {
    const lowStill = { right: () => ({ x: 0.75, y: 0.75 }), left: () => ({ x: 0.25, y: 0.75 }) }
    const r = simulate({ demo: { paths: lowStill }, seconds: 3, transport: 'playing' })
    expect(r.events.filter((e) => e.type === 'cue').map((e) => (e.type === 'cue' ? e.cue : ''))).toEqual(['stop'])
  })

  it('raising both hands while playing pauses it', () => {
    const r = simulate({ demo: { paths: still }, seconds: 3, transport: 'playing' })
    expect(r.events.filter((e) => e.type === 'cue').map((e) => (e.type === 'cue' ? e.cue : ''))).toEqual(['pause'])
  })

  it('no cue ever fires during 60 s of normal conducting with the left hand high, low and moving', () => {
    for (const leftLevel of [0.95, 0.03, (t: number) => 0.5 + 0.45 * Math.sin(t / 2)]) {
      for (const transport of ['playing', 'stopped'] as const) {
        const r = simulate({ demo: { bpm: 85, leftLevel, noise: 0.003 }, seconds: 60, transport })
        expect(r.events.filter((e) => e.type === 'cue')).toHaveLength(0)
      }
    }
  })
})
