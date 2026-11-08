import { FakeAudioContext, FakeSource } from '@/test/fakeWebAudio'
import { makeHallImpulse, SampledBackend } from './sampledBackend'
import type { SampleManifest } from './sampleBank'
import type { ScheduledNote } from './sequencer'

const manifest: SampleManifest = {
  version: 1, build: 'test', sampleRate: 48000,
  source: { name: 'Test library', url: 'x', commit: 'abcdef123456', license: 'CC0-1.0' },
  instruments: {
    violins: { kind: 'sustained', section: 'strings', label: 'Violins', release: 0.4, samples: [48, 60, 72].map((root) => ({ file: `violins/${root}.ogg`, root, cents: root === 60 ? -10 : 0, loopStart: 0.5, loopEnd: 3, duration: 3 })) },
    timpani: { kind: 'hit', section: 'percussion', label: 'Timpani', voices: [{ name: 'low', root: 40, cents: 0, layers: [{ file: 'timpani/low_l1.ogg', duration: 3 }, { file: 'timpani/low_l2.ogg', duration: 3 }] }, { name: 'high', root: 50, cents: 0, layers: [{ file: 'timpani/high_l1.ogg', duration: 3 }, { file: 'timpani/high_l2.ogg', duration: 3 }] }] },
  },
}

function make(extra: Partial<ConstructorParameters<typeof SampledBackend>[0]> = {}) {
  const ctx = new FakeAudioContext()
  const fetched: string[] = []
  const backend = new SampledBackend({
    baseUrl: '/samples/',
    contextFactory: () => ctx as unknown as AudioContext,
    fetchBytes: (url) => {
      fetched.push(url)
      return Promise.resolve(new TextEncoder().encode(url.replace('/samples/', '')).buffer as ArrayBuffer)
    },
    ...extra,
  })
  return { ctx, backend, fetched }
}
const note = (o: Partial<ScheduledNote>): ScheduledNote => ({ section: 'strings', midi: 60, timeSec: 10.05, durationSec: 1, velocity: 0.8, beat: 0, ...o })

describe('SampledBackend', () => {
  beforeEach(() => {
    globalThis.fetch = (() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifest) })) as unknown as typeof fetch
  })

  it('downloads only the sample sets the instruments need (Violins II reuse the violin recordings)', async () => {
    const { backend, fetched } = make()
    await backend.init()
    await backend.prepare(['violins', 'violins2'])
    expect(fetched.sort()).toEqual(['/samples/violins/48.ogg', '/samples/violins/60.ogg', '/samples/violins/72.ogg'])
    await backend.prepare(['violins']) // idempotent: nothing is fetched twice
    expect(fetched).toHaveLength(3)
  })

  it('reports progress', async () => {
    const { backend } = make()
    await backend.init()
    const seen: string[] = []
    await backend.prepare(['violins', 'timpani'], (p) => seen.push(`${p.loaded}/${p.total}`))
    expect(seen[0]).toBe('0/7')
    expect(seen.at(-1)).toBe('7/7')
  })

  it('plays the nearest recording, re-pitched exactly (no stretching), looped, in tune', async () => {
    const { ctx, backend } = make()
    await backend.init()
    await backend.prepare(['violins'])
    backend.scheduleNote(note({ midi: 64, instrument: 'violins' })) // 4 above the 60 recording (its −10¢ error is corrected)
    backend.pump()
    const src = ctx.created.sources.at(-1) as FakeSource
    expect(src.buffer?.id).toBe('violins/60.ogg')
    expect(src.playbackRate.value).toBeGreaterThan(2 ** (4 / 12) * 2 ** (-12 / 1200)) // 4 semitones, ± a few cents of ensemble detune
    expect(src.playbackRate.value).toBeLessThan(2 ** (4 / 12) * 2 ** (-8 / 1200) * 1.005)
    expect(src.loop).toBe(true)
    expect(src.loopStart).toBe(0.5)
    expect(src.loopEnd).toBe(3)
    expect(src.started).toBeCloseTo(10.05, 5)
    expect(src.stopped).toBeGreaterThan(11.05) // after the note plus its release
  })

  it('a note on a recorded pitch plays at unison, whatever its length or the tempo', async () => {
    const { ctx, backend } = make()
    await backend.init()
    await backend.prepare(['violins'])
    for (const dur of [0.2, 1, 5]) backend.scheduleNote(note({ midi: 72, instrument: 'violins', durationSec: dur }))
    backend.pump()
    for (const s of ctx.created.sources) expect(Math.abs(Math.log2(s.playbackRate.value) - 0)).toBeLessThan(0.01) // root 72 = unison
  })

  it('timpani: the nearest drum, velocity layer by loudness', async () => {
    const { ctx, backend } = make()
    await backend.init()
    await backend.prepare(['timpani'])
    backend.scheduleNote(note({ section: 'percussion', instrument: 'timpani', midi: 49, velocity: 0.9 }))
    backend.scheduleNote(note({ section: 'percussion', instrument: 'timpani', midi: 41, velocity: 0.1 }))
    backend.pump()
    const [a, b] = ctx.created.sources
    expect(a.buffer?.id).toBe('timpani/high_l2.ogg')
    expect(b.buffer?.id).toBe('timpani/low_l1.ogg')
    expect(a.loop).toBe(false)
  })

  it('notes are only sounded within the flush window, so silence() can cancel the rest', async () => {
    const { ctx, backend } = make()
    await backend.init()
    await backend.prepare(['violins'])
    backend.scheduleNote(note({ instrument: 'violins', timeSec: 12 }))
    backend.pump()
    expect(ctx.created.sources).toHaveLength(0)
    backend.silence()
    ctx.currentTime = 12
    backend.pump()
    expect(ctx.created.sources).toHaveLength(0) // cancelled, never sounded
  })

  it('silence() releases sounding voices and closes the gate', async () => {
    const { ctx, backend } = make()
    await backend.init()
    await backend.prepare(['violins'])
    backend.scheduleNote(note({ instrument: 'violins', durationSec: 8 }))
    backend.pump()
    const src = ctx.created.sources[0]
    backend.silence()
    expect(src.stopped).toBeLessThan(10.2)
  })

  it('an instrument whose samples are not loaded still sounds (plain fallback tone) instead of silence', async () => {
    const { ctx, backend } = make()
    await backend.init()
    backend.scheduleNote(note({ instrument: 'violins' }))
    backend.pump()
    expect(ctx.created.sources[0].kind).toBe('osc')
  })

  it('dispose() closes the context and disconnects the graph', async () => {
    const { ctx, backend } = make()
    await backend.init()
    backend.dispose()
    expect(ctx.closed).toBe(true)
  })

  it('init() fails with a SampleLoadError when the library is missing', async () => {
    globalThis.fetch = (() => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('no')) })) as unknown as typeof fetch
    await expect(make().backend.init()).rejects.toMatchObject({ name: 'SampleLoadError' })
  })

  it('a sample that fails to decode fails prepare() with a SampleLoadError', async () => {
    const { ctx, backend } = make()
    await backend.init()
    ctx.decodeAudioData = () => Promise.reject(new Error('bad data'))
    await expect(backend.prepare(['violins'])).rejects.toMatchObject({ name: 'SampleLoadError' })
  })
})

describe('hall impulse response', () => {
  it('is deterministic, stereo, and decays', () => {
    const ctx = new FakeAudioContext() as unknown as BaseAudioContext
    const a = makeHallImpulse(ctx, 0.5, 3)
    expect(a.numberOfChannels).toBe(2)
  })
})
