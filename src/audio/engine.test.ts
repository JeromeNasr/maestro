import { FakeBackend } from '@/test/fakeAudio'
import { SECTIONS } from '@/orchestra/sections'
import { AudioEngine } from './engine'
import { sectionBrightnessHz, sectionDynamicsGain } from './dynamics'
import type { Score } from './score'

const SCORE: Score = {
  title: 'Test piece',
  notes: Array.from({ length: 48 }, (_, i) => ({
    section: (['strings', 'woodwinds', 'brass', 'percussion'] as const)[i % 4], midi: 60 + (i % 7), startBeat: i / 2, durationBeats: 0.5, velocity: 0.8, trackId: 0,
  })),
  tempoMap: [{ beat: 0, bpm: 120 }], meters: [{ beat: 0, numerator: 4, denominator: 4 }], tracks: [], totalBeats: 24, referenceBpm: 120, beatsPerBar: 4,
}

function setup(over: { failInit?: Error } = {}) {
  const backend = new FakeBackend()
  backend.failInit = over.failInit ?? null
  const createBackend = vi.fn(() => backend)
  const intervals: { cb: () => void; ms: number; cleared: boolean }[] = []
  const engine = new AudioEngine({
    createBackend,
    setInterval: (cb, ms) => {
      const h = { cb, ms, cleared: false }
      intervals.push(h)
      return h
    },
    clearInterval: (h) => void ((h as { cleared: boolean }).cleared = true),
  })
  /** Advance the audio clock and run the scheduler like the timer would. */
  const advance = (sec: number, tickSec = 0.025) => {
    for (let t = 0; t < sec - 1e-9; t += tickSec) {
      backend.now += tickSec
      engine.tick()
    }
  }
  return { backend, engine, createBackend, intervals, advance }
}

async function ready(over?: Parameters<typeof setup>[0]) {
  const s = setup(over)
  await s.engine.init()
  s.engine.load(SCORE)
  return s
}

describe('AudioEngine — initialisation (explicit user interaction)', () => {
  it('does nothing until init(): no backend is created and play is refused', () => {
    const { engine, createBackend } = setup()
    engine.load(SCORE)
    expect(createBackend).not.toHaveBeenCalled()
    expect(engine.snapshot.status).toBe('uninitialized')
    expect(engine.play()).toBe(false)
  })

  it('init creates the backend once, even if called repeatedly or concurrently', async () => {
    const s = setup()
    await Promise.all([s.engine.init(), s.engine.init(), s.engine.init()])
    await s.engine.init()
    expect(s.createBackend).toHaveBeenCalledTimes(1)
    expect(s.backend.initCalls).toBe(1)
    expect(s.engine.snapshot).toMatchObject({ status: 'ready', error: null })
    expect(s.engine.snapshot.backend).toMatchObject({ kind: 'fake', sampleRate: 48000 })
  })

  it('reports init failures (e.g. autoplay blocked) and can retry', async () => {
    const s = setup({ failInit: new Error('The browser blocked audio. Click Start again.') })
    await s.engine.init()
    expect(s.engine.snapshot.status).toBe('error')
    expect(s.engine.snapshot.error).toMatch(/blocked audio/)
    expect(s.backend.disposed).toBe(true) // a half-built graph is released
    expect(s.engine.play()).toBe(false)
    s.backend.failInit = null
    s.backend.disposed = false
    await s.engine.init()
    expect(s.engine.snapshot.status).toBe('ready')
    expect(s.createBackend).toHaveBeenCalledTimes(2)
  })

  it('applies the initial mix and dynamics to the backend as soon as it is ready', async () => {
    const { backend } = await ready()
    for (const { id } of SECTIONS) expect(backend.gains[id]).toBeGreaterThan(0)
    expect(backend.master).toBeGreaterThan(0)
  })
})

describe('AudioEngine — transport', () => {
  it('load publishes the piece; play starts the scheduler and notes reach the backend', async () => {
    const { engine, backend, advance, intervals } = await ready()
    expect(engine.snapshot.loaded).toMatchObject({ title: 'Test piece', referenceBpm: 120, beatsPerBar: 4 })
    expect(engine.snapshot.loaded!.sections.sort()).toEqual(['brass', 'percussion', 'strings', 'woodwinds'])
    expect(engine.snapshot.transport).toBe('stopped')
    expect(engine.play()).toBe(true)
    expect(engine.snapshot.transport).toBe('playing')
    expect(intervals).toHaveLength(1)
    expect(intervals[0].ms).toBe(25)
    advance(3)
    expect(backend.notes.length).toBeGreaterThan(8)
    expect(backend.pumps).toBeGreaterThan(50)
    expect(engine.snapshot.positionBeats).toBeGreaterThan(4)
    expect(engine.snapshot.elapsedSec).toBeGreaterThan(2)
  })

  it('pause silences immediately and freezes the position; resume continues without a jump', async () => {
    const { engine, backend, advance, intervals } = await ready()
    engine.play()
    advance(2)
    const pos = engine.snapshot.positionBeats
    engine.pause()
    expect(engine.snapshot.transport).toBe('paused')
    expect(backend.silenced).toBe(true)
    expect(intervals[0].cleared).toBe(true) // scheduler timer stopped
    const notesBefore = backend.notes.length
    advance(2)
    expect(backend.notes.length).toBe(notesBefore) // nothing scheduled while paused
    expect(engine.snapshot.positionBeats).toBeCloseTo(pos, 1)
    expect(engine.resume()).toBe(true)
    expect(backend.silenced).toBe(false)
    expect(backend.unsilenceAt.at(-1)).toBeGreaterThan(backend.now) // gate re-opens a moment later
    advance(2)
    expect(engine.snapshot.positionBeats).toBeGreaterThan(pos + 2)
    expect(engine.snapshot.transport).toBe('playing')
  })

  it('stop silences, rewinds and stops the timer; play then starts over', async () => {
    const { engine, backend, advance, intervals } = await ready()
    engine.play()
    advance(3)
    engine.stop()
    expect(backend.silenced).toBe(true)
    expect(intervals[0].cleared).toBe(true)
    expect(engine.snapshot).toMatchObject({ transport: 'stopped', positionBeats: 0, progress: 0, bar: 1, beatInBar: 1 })
    backend.notes.length = 0
    engine.play()
    advance(1)
    expect(backend.notes[0].beat).toBe(0)
  })

  it('stop is safe at any time (before init, before load, twice)', () => {
    const s = setup()
    expect(() => {
      s.engine.stop()
      s.engine.pause()
      s.engine.resume()
    }).not.toThrow()
  })

  it('reaches the end on its own: transport finished, listeners fired once, timer cleared', async () => {
    const { engine, advance, intervals } = await ready()
    const done = vi.fn()
    engine.onFinished(done)
    engine.setTargetBpm(260) // brisk: finish sooner
    engine.play()
    advance(30)
    expect(engine.snapshot.transport).toBe('finished')
    expect(done).toHaveBeenCalledTimes(1)
    expect(intervals[0].cleared).toBe(true)
    expect(engine.snapshot.progress).toBe(1)
  })

  it('reports bar and beat', async () => {
    const { engine, advance } = await ready()
    engine.play()
    advance(4.3) // ≈ 8 beats at 120 BPM → start of bar 3
    expect(engine.snapshot.bar).toBeGreaterThanOrEqual(2)
    expect(engine.snapshot.beatInBar).toBeGreaterThanOrEqual(1)
    expect(engine.snapshot.beatInBar).toBeLessThanOrEqual(4)
  })
})

describe('AudioEngine — tempo following', () => {
  it('setTargetBpm changes note spacing but never pitch, and does not restart the piece', async () => {
    const { engine, backend, advance } = await ready()
    engine.play()
    advance(3)
    const n1 = backend.notes.length
    engine.setTargetBpm(240)
    advance(6)
    const sorted = backend.notes.map((n) => n.beat)
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b))
    expect(new Set(sorted).size).toBe(sorted.length)
    backend.notes.forEach((n) => expect(n.midi).toBe(60 + (Math.round(n.beat * 2) % 7)))
    // note spacing: ~0.25 s at 120 BPM before the change, markedly tighter once the tempo has glided up
    const gap = (i: number) => backend.notes[i + 1].timeSec - backend.notes[i].timeSec
    const early = gap(4)
    const late = gap(backend.notes.length - 6)
    expect(early).toBeCloseTo(0.25, 1)
    expect(late).toBeLessThan(early * 0.7)
    expect(n1).toBeGreaterThan(8)
    expect(engine.snapshot.targetBpm).toBe(240)
    expect(engine.snapshot.currentBpm!).toBeGreaterThan(200)
  })

  it('the published tempo glides rather than jumping', async () => {
    const { engine, advance } = await ready()
    engine.play()
    advance(1)
    engine.setTargetBpm(200)
    const seen: number[] = []
    for (let i = 0; i < 20; i++) {
      advance(0.1)
      seen.push(engine.snapshot.currentBpm!)
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeLessThan(6) // ≤ 45 BPM/s × 0.1 s (+ slack)
    expect(seen.at(-1)!).toBeGreaterThan(seen[0])
  })

  it('tempo set before playing is used from the first note; reset returns to the score tempo', async () => {
    const { engine, backend, advance } = await ready()
    engine.setTargetBpm(60)
    engine.play()
    advance(5)
    const gaps = backend.notes.slice(1, 6).map((n, i) => n.timeSec - backend.notes[i].timeSec)
    expect(gaps.every((g) => g > 0)).toBe(true)
    engine.reset()
    expect(engine.snapshot.targetBpm).toBe(120)
    expect(engine.snapshot.transport).toBe('stopped')
  })
})

describe('AudioEngine — dynamics', () => {
  it('maps the conductor level to each section\'s gain and brightness, smoothly (ramped)', async () => {
    const { engine, backend } = await ready()
    backend.gainLog.length = 0
    engine.setDynamicsLevel(0.1)
    const quiet = { ...backend.gains }
    const quietBright = { ...backend.brightness }
    engine.setDynamicsLevel(0.95)
    for (const { id } of SECTIONS) {
      expect(backend.gains[id]).toBeGreaterThan(quiet[id] * 3)
      expect(backend.brightness[id]).toBeGreaterThan(quietBright[id])
      expect(backend.gains[id]).toBeCloseTo(0.64 * sectionDynamicsGain(id, 0.95), 5) // default mixer gain (0.8²) × dynamics
      expect(backend.brightness[id]).toBeCloseTo(sectionBrightnessHz(id, 0.95), 3)
    }
    expect(backend.gainLog.every((g) => g.ramp > 0)).toBe(true)
    expect(engine.snapshot.dynamicsLevel).toBeCloseTo(0.95)
  })

  it('scales note velocity with the level (softer playing hits softer)', async () => {
    const { engine, backend, advance } = await ready()
    engine.setDynamicsLevel(0)
    engine.play()
    advance(2)
    const soft = backend.notes.slice(0, 4).map((n) => n.velocity)
    engine.stop()
    backend.notes.length = 0
    engine.setDynamicsLevel(1)
    engine.play()
    advance(2)
    const loud = backend.notes.slice(0, 4).map((n) => n.velocity)
    soft.forEach((v, i) => expect(loud[i]).toBeGreaterThan(v * 1.5))
    expect(Math.max(...loud)).toBeLessThanOrEqual(1)
  })

  it('ignores negligible changes and clamps/ignores bad values', async () => {
    const { engine, backend } = await ready()
    engine.setDynamicsLevel(0.58)
    backend.gainLog.length = 0
    engine.setDynamicsLevel(0.5801)
    expect(backend.gainLog).toHaveLength(0)
    engine.setDynamicsLevel(7)
    expect(engine.snapshot.dynamicsLevel).toBe(1)
    engine.setDynamicsLevel(NaN)
    expect(Number.isFinite(engine.snapshot.dynamicsLevel)).toBe(true)
  })
})

describe('AudioEngine — orchestra section controls reach the audio graph', () => {
  it('volume, mute and solo change the backend gains (and unmute restores them)', async () => {
    const { engine, backend } = await ready()
    const base = backend.gains.brass
    engine.mixer.setVolume('brass', 0.4)
    expect(backend.gains.brass).toBeCloseTo(base * (0.16 / 0.64), 5)
    engine.mixer.setMuted('brass', true)
    expect(backend.gains.brass).toBe(0)
    expect(backend.gains.strings).toBeGreaterThan(0) // others unaffected
    engine.mixer.setMuted('brass', false)
    expect(backend.gains.brass).toBeGreaterThan(0)
    engine.mixer.setSolo('woodwinds', true)
    expect(backend.gains.woodwinds).toBeGreaterThan(0)
    for (const id of ['strings', 'brass', 'percussion'] as const) expect(backend.gains[id]).toBe(0)
    engine.mixer.setSolo('woodwinds', false)
    for (const { id } of SECTIONS) expect(backend.gains[id]).toBeGreaterThan(0)
  })

  it('master volume reaches the backend; mixing is independent of dynamics', async () => {
    const { engine, backend } = await ready()
    engine.mixer.setMaster(0.5)
    expect(backend.master).toBeCloseTo(0.25)
    engine.setDynamicsLevel(0.2)
    expect(backend.master).toBeCloseTo(0.25)
    engine.mixer.setMuted('strings', true)
    engine.setDynamicsLevel(0.9)
    expect(backend.gains.strings).toBe(0) // dynamics cannot un-mute
  })

  it('publishes the measured section levels from the backend', async () => {
    const { engine, backend, advance } = await ready()
    backend.meter = { strings: 0.5, woodwinds: 0, brass: 0.2, percussion: 0 }
    engine.play()
    advance(0.5)
    expect(engine.snapshot.levels.strings).toBe(0.5)
    expect(engine.snapshot.levels.woodwinds).toBe(0)
  })
})

describe('AudioEngine — errors and disposal', () => {
  it('a failure while scheduling silences the music and reports an error', async () => {
    const { engine, backend, advance, intervals } = await ready()
    engine.play()
    advance(1)
    backend.scheduleNote = () => {
      throw new Error('audio device lost')
    }
    advance(1)
    expect(engine.snapshot.status).toBe('error')
    expect(engine.snapshot.error).toMatch(/audio device lost/)
    expect(backend.silenced).toBe(true)
    expect(intervals[0].cleared).toBe(true)
  })

  it('dispose releases the backend, timer and subscriptions — and is idempotent', async () => {
    const { engine, backend, advance, intervals } = await ready()
    engine.play()
    advance(1)
    engine.dispose()
    engine.dispose()
    expect(backend.disposed).toBe(true)
    expect(backend.silenced).toBe(true)
    expect(intervals[0].cleared).toBe(true)
    expect(engine.snapshot.status).toBe('uninitialized')
    const gains = { ...backend.gains }
    engine.mixer.setMuted('strings', true) // no longer wired to the (disposed) backend
    expect(backend.gains).toEqual(gains)
    expect(engine.play()).toBe(false)
    await expect(engine.init()).rejects.toThrow(/disposed/)
  })

  it('dispose during initialisation releases the backend that finishes later', async () => {
    const backend = new FakeBackend()
    let release!: () => void
    backend.init = () => new Promise<void>((r) => (release = r))
    const engine = new AudioEngine({ createBackend: () => backend })
    const p = engine.init()
    engine.dispose()
    release()
    await p
    expect(backend.disposed).toBe(true)
    expect(engine.snapshot.status).toBe('uninitialized')
  })

  it('loading a new piece while playing stops the old one', async () => {
    const { engine, backend, advance } = await ready()
    engine.play()
    advance(1)
    engine.load({ ...SCORE, title: 'Other' })
    expect(engine.snapshot.transport).toBe('stopped')
    expect(backend.silenced).toBe(true)
    expect(engine.snapshot.loaded!.title).toBe('Other')
  })
})
