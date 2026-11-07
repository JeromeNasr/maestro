import { rng } from '@/test/fixtures'
import type { Score, ScoreNote } from './score'
import { DEFAULT_SEQUENCER_OPTIONS, Sequencer, type ScheduledNote } from './sequencer'

function score(notes: Partial<ScoreNote>[], o: Partial<Score> = {}): Score {
  const full: ScoreNote[] = notes.map((n, i) => ({ section: 'strings', midi: 60, startBeat: i, durationBeats: 1, velocity: 0.8, trackId: 0, ...n }))
  const total = Math.max(...full.map((n) => n.startBeat + n.durationBeats))
  return { title: 't', notes: full, tempoMap: [{ beat: 0, bpm: 120 }], meters: [{ beat: 0, numerator: 4, denominator: 4 }], tracks: [], totalBeats: total, referenceBpm: 120, beatsPerBar: 4, ...o }
}
/** A scale: one note per beat, each a different pitch. */
const scale = (n = 32) => score(Array.from({ length: n }, (_, i) => ({ startBeat: i, midi: 60 + (i % 12) })))

/** Drive a sequencer at 25 ms ticks for `seconds`, collecting emitted notes. */
function run(seq: Sequencer, from: number, seconds: number, onTick?: (t: number) => void, tickMs = 25) {
  const out: ScheduledNote[] = []
  for (let t = from; t <= from + seconds + 1e-9; t += tickMs / 1000) {
    onTick?.(t)
    seq.tick(t, (n) => out.push(n))
  }
  return out
}

describe('Sequencer — musical-time scheduling', () => {
  it('places notes on the audio clock at the right times (120 BPM = a beat every 0.5 s)', () => {
    const seq = new Sequencer(scale(), {}, 120)
    seq.play(10)
    const out = run(seq, 10, 8)
    expect(out.length).toBeGreaterThanOrEqual(15)
    const t0 = out[0].timeSec
    expect(t0).toBeCloseTo(10 + DEFAULT_SEQUENCER_OPTIONS.leadInSec, 2) // first note after the lead-in
    out.slice(0, 16).forEach((n, i) => expect(n.timeSec - t0).toBeCloseTo(i * 0.5, 2))
    out.slice(0, 16).forEach((n, i) => expect(n.midi).toBe(60 + (i % 12)))
  })

  it('notes are handed over only within the look-ahead window and never emitted twice', () => {
    const seq = new Sequencer(scale(), { lookaheadSec: 0.12 }, 120)
    seq.play(0)
    const seen = new Set<number>()
    for (let t = 0; t < 6; t += 0.025) {
      seq.tick(t, (n) => {
        expect(n.timeSec).toBeLessThanOrEqual(t + 0.12 + 1e-6)
        expect(n.timeSec).toBeGreaterThanOrEqual(t - 1e-6)
        expect(seen.has(n.beat)).toBe(false)
        seen.add(n.beat)
      })
    }
    expect(seen.size).toBeGreaterThan(8)
  })

  it('PITCH IS PRESERVED across tempos: the same MIDI notes in the same order; only times and durations scale', () => {
    const play = (bpm: number) => {
      const seq = new Sequencer(scale(24), { tempoTauSec: 0.001, maxSlewBpmPerSec: 1e6 }, bpm)
      seq.play(0)
      return run(seq, 0, 40)
    }
    const slow = play(60)
    const mid = play(120)
    const fast = play(240)
    const n = Math.min(slow.length, mid.length, fast.length, 20)
    expect(n).toBeGreaterThanOrEqual(12)
    for (let i = 0; i < n; i++) {
      expect(mid[i].midi).toBe(slow[i].midi)
      expect(fast[i].midi).toBe(slow[i].midi)
      expect(mid[i].beat).toBe(slow[i].beat)
    }
    // inter-onset time halves each time the tempo doubles
    const gap = (o: ScheduledNote[]) => o[8].timeSec - o[7].timeSec
    expect(gap(slow)).toBeCloseTo(1.0, 2)
    expect(gap(mid)).toBeCloseTo(0.5, 2)
    expect(gap(fast)).toBeCloseTo(0.25, 2)
    expect(slow[3].durationSec).toBeCloseTo(1.0, 2)
    expect(fast[3].durationSec).toBeCloseTo(0.25, 2)
  })

  it('a tempo change mid-piece neither restarts nor changes pitch; the music just goes faster', () => {
    const seq = new Sequencer(scale(64), {}, 60)
    seq.play(0)
    const out = run(seq, 0, 30, (t) => {
      if (Math.abs(t - 6) < 0.0125) seq.setTargetBpm(150, t)
    })
    const beats = out.map((n) => n.beat)
    expect(beats).toEqual([...beats].sort((a, b) => a - b)) // order preserved
    expect(new Set(beats).size).toBe(beats.length) // nothing replayed
    expect(beats[0]).toBe(0) // not restarted
    out.forEach((n) => expect(n.midi).toBe(60 + (n.beat % 12))) // pitches unchanged
    const early = out.filter((n) => n.timeSec < 5).length
    const late = out.filter((n) => n.timeSec > 20 && n.timeSec < 25).length
    expect(late / 5).toBeGreaterThan((early / 5) * 2) // ≈ 2.5× as many notes per second
  })

  it('NO POSITION JUMPS: position is continuous and bounded by the integrated tempo, even with wild tempo targets', () => {
    const r = rng(11)
    const seq = new Sequencer(scale(200), {}, 90)
    seq.play(0)
    let prev = 0
    let maxStep = 0
    for (let t = 0; t < 30; t += 0.025) {
      if (Math.abs((t / 0.7) % 1) < 0.0125) seq.setTargetBpm(40 + r() * 180, t) // new random target every 0.7 s
      seq.tick(t, () => undefined)
      const pos = seq.positionAt(t)
      expect(pos).toBeGreaterThanOrEqual(prev - 1e-9) // never goes backwards
      maxStep = Math.max(maxStep, pos - prev)
      prev = pos
    }
    // largest possible advance in 25 ms at the maximum tempo the sequencer allows
    expect(maxStep).toBeLessThan((DEFAULT_SEQUENCER_OPTIONS.maxBpm / 60) * 0.025 * 1.05)
  })

  it('tempo glides: the played tempo changes at a bounded rate toward the target, then settles', () => {
    const seq = new Sequencer(scale(200), {}, 60)
    seq.play(0)
    seq.setTargetBpm(180, 0)
    let prev = seq.currentBpm
    let maxRate = 0
    for (let t = 0.025; t < 6; t += 0.025) {
      seq.tick(t, () => undefined)
      maxRate = Math.max(maxRate, Math.abs(seq.currentBpm - prev) / 0.025)
      prev = seq.currentBpm
    }
    expect(maxRate).toBeLessThanOrEqual(DEFAULT_SEQUENCER_OPTIONS.maxSlewBpmPerSec * 1.02)
    expect(seq.currentBpm).toBeGreaterThan(178)
    expect(seq.currentBpm).toBeLessThanOrEqual(180.0001)
  })

  it('a tempo target set between ticks applies from that moment, not retroactively', () => {
    const a = new Sequencer(scale(200), {}, 60)
    const b = new Sequencer(scale(200), {}, 60)
    a.play(0)
    b.play(0)
    run(a, 0, 5)
    run(b, 0, 5)
    a.setTargetBpm(120, 5)
    for (let t = 5.025; t < 8; t += 0.025) a.tick(t, () => undefined)
    for (let t = 5.025; t < 8; t += 0.025) b.tick(t, () => undefined)
    // b stayed at 60 BPM, a sped up only after t = 5
    const posA = a.positionAt(8)
    const posB = b.positionAt(8)
    expect(posB).toBeCloseTo(((8 - 0.12) * 60) / 60, 1)
    expect(posA).toBeGreaterThan(posB + 1)
    expect(posA).toBeLessThan(posB + 3.2)
  })

  it('emitted note times agree with the integrated position (checked as each note is scheduled)', () => {
    const seq = new Sequencer(scale(40), {}, 100)
    seq.play(0)
    let checked = 0
    for (let t = 0; t < 20; t += 0.025) {
      seq.tick(t, (n) => {
        expect(seq.positionAt(n.timeSec)).toBeCloseTo(n.beat, 1)
        checked++
      })
    }
    expect(checked).toBeGreaterThan(25)
  })

  it('stays synchronised with the conductor: once settled, position advances at the target speed', () => {
    const seq = new Sequencer(scale(400), {}, 80)
    seq.play(0)
    run(seq, 0, 3)
    seq.setTargetBpm(120, 3)
    run(seq, 3.025, 9) // let the glide settle
    const p1 = seq.positionBeats
    const t1 = 3.025 + 9
    run(seq, t1 + 0.025, 10)
    const p2 = seq.positionBeats
    expect((p2 - p1) / (10 + 0.025)).toBeCloseTo(2, 1) // 120 BPM = 2 beats per second
  })

  it('follows the composer\'s own tempo map (ritardando) on top of the conductor tempo', () => {
    const s = score(Array.from({ length: 40 }, (_, i) => ({ startBeat: i, midi: 60 })), { tempoMap: [{ beat: 0, bpm: 120 }, { beat: 20, bpm: 60 }] })
    const seq = new Sequencer(s, { tempoTauSec: 0.001, maxSlewBpmPerSec: 1e6 }, 120)
    seq.play(0)
    const out = run(seq, 0, 60)
    const before = out.find((n) => n.beat === 10 + 1)!.timeSec - out.find((n) => n.beat === 10)!.timeSec
    const after = out.find((n) => n.beat === 30 + 1)!.timeSec - out.find((n) => n.beat === 30)!.timeSec
    expect(before).toBeCloseTo(0.5, 2)
    expect(after).toBeCloseTo(1.0, 2) // half speed after the mark
    // conducting 1.5× faster scales both
    const fast = new Sequencer(s, { tempoTauSec: 0.001, maxSlewBpmPerSec: 1e6 }, 180)
    fast.play(0)
    const o2 = run(fast, 0, 40)
    expect(o2.find((n) => n.beat === 31)!.timeSec - o2.find((n) => n.beat === 30)!.timeSec).toBeCloseTo(1 / 1.5, 2)
  })

  it('pause keeps the position; resume continues from it without replaying earlier notes', () => {
    const seq = new Sequencer(scale(60), {}, 120)
    seq.play(0)
    const first = run(seq, 0, 4)
    seq.pause(4.0)
    const posAtPause = seq.positionBeats
    expect(seq.state).toBe('paused')
    expect(run(seq, 4.025, 3)).toHaveLength(0) // silent while paused
    expect(seq.positionBeats).toBe(posAtPause) // frozen
    seq.play(7)
    const after = run(seq, 7, 3)
    expect(after.length).toBeGreaterThan(5)
    expect(after[0].beat).toBeGreaterThanOrEqual(Math.floor(posAtPause - 1e-6))
    const firstMax = Math.max(...first.map((n) => n.beat))
    // notes already handed over before the pause may be re-issued once (the backend cancels the unsounded ones), but nothing earlier
    expect(after[0].beat).toBeGreaterThanOrEqual(firstMax - 1)
    expect(after[0].timeSec).toBeGreaterThanOrEqual(7 + DEFAULT_SEQUENCER_OPTIONS.leadInSec - 1e-6)
  })

  it('stop rewinds to the beginning; playing again starts the piece over', () => {
    const seq = new Sequencer(scale(30), {}, 120)
    seq.play(0)
    run(seq, 0, 5)
    seq.stop()
    expect(seq.state).toBe('stopped')
    expect(seq.positionBeats).toBe(0)
    seq.play(20)
    const out = run(seq, 20, 2)
    expect(out[0].beat).toBe(0)
    expect(out[0].timeSec).toBeCloseTo(20 + DEFAULT_SEQUENCER_OPTIONS.leadInSec, 2)
  })

  it('finishes after the last note plus the tail', () => {
    const seq = new Sequencer(scale(6), {}, 240)
    seq.play(0)
    let state = seq.state
    for (let t = 0; t < 10 && state !== 'finished'; t += 0.025) state = seq.tick(t, () => undefined)
    expect(state).toBe('finished')
    expect(seq.positionBeats).toBeGreaterThanOrEqual(seq.totalBeats + DEFAULT_SEQUENCER_OPTIONS.tailBeats)
  })

  it('a stalled clock (e.g. a suspended tab) drops stale notes instead of bursting them', () => {
    const seq = new Sequencer(scale(100), {}, 120)
    seq.play(0)
    run(seq, 0, 1)
    const burst: ScheduledNote[] = []
    seq.tick(20, (n) => burst.push(n)) // 19 s later
    expect(burst.length).toBeLessThanOrEqual(2)
  })

  it('clamps tempo to its limits and ignores non-finite targets', () => {
    const seq = new Sequencer(scale(), {}, 120)
    seq.setTargetBpm(9999, 0)
    expect(seq.targetBpm).toBe(DEFAULT_SEQUENCER_OPTIONS.maxBpm)
    seq.setTargetBpm(1, 0)
    expect(seq.targetBpm).toBe(DEFAULT_SEQUENCER_OPTIONS.minBpm)
    seq.setTargetBpm(NaN, 0)
    expect(Number.isFinite(seq.targetBpm)).toBe(true)
  })

  it('seekToBeat and resetTempo', () => {
    const seq = new Sequencer(scale(40), {}, 120)
    seq.seekToBeat(10, 0)
    seq.play(0)
    const out = run(seq, 0, 3)
    expect(out[0].beat).toBe(10)
    seq.setTargetBpm(200, 3)
    seq.resetTempo()
    expect(seq.targetBpm).toBe(120)
  })

  it('carries section, velocity and drum-kit flags through unchanged', () => {
    const s = score([{ startBeat: 0, section: 'percussion', midi: 38, velocity: 0.6, kit: true }, { startBeat: 1, section: 'brass', midi: 55, velocity: 0.9 }])
    const seq = new Sequencer(s, {}, 120)
    seq.play(0)
    const out = run(seq, 0, 2)
    expect(out[0]).toMatchObject({ section: 'percussion', midi: 38, velocity: 0.6, kit: true })
    expect(out[1]).toMatchObject({ section: 'brass', midi: 55, velocity: 0.9 })
    expect(out[1].kit).toBeUndefined()
  })

  it('works with a real composition end to end', async () => {
    const { readFileSync } = await import('node:fs')
    const { parseMidi } = await import('./midi')
    const real = parseMidi(new Uint8Array(readFileSync('public/midi/aurora-etude.mid')))
    const seq = new Sequencer(real, {}, real.referenceBpm)
    seq.play(0)
    const out = run(seq, 0, 12)
    expect(out.length).toBeGreaterThan(30)
    expect(new Set(out.map((n) => n.section))).toEqual(new Set(['strings'])) // the opening theme is strings only
    const later = run(seq, 12.025, 20) // …and the other sections enter at bar 9 (≈ 23 s)
    expect(new Set(later.map((n) => n.section)).size).toBeGreaterThanOrEqual(3)
    expect(out.every((n) => n.midi >= 21 && n.midi <= 108)).toBe(true)
  })
})
