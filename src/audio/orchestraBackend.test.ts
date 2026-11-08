import { FakeBackend } from '@/test/fakeAudio'
import { AudioEngine } from './engine'
import { OrchestraBackend } from './orchestraBackend'
import type { LoadProgress } from './backend'
import type { InstrumentId } from './instruments'
import { parseMidi } from './midi'
import { SampleLoadError } from './sampledBackend'

class SampledFake extends FakeBackend {
  prepared: InstrumentId[][] = []
  failPrepare: Error | null = null
  async prepare(inst: InstrumentId[], onProgress?: (p: LoadProgress) => void) {
    onProgress?.({ loaded: 0, total: 2, instrument: 'violins' })
    if (this.failPrepare) throw this.failPrepare
    this.prepared.push(inst)
    onProgress?.({ loaded: 2, total: 2, instrument: 'violins' })
  }
}

describe('OrchestraBackend', () => {
  it('uses the sampled backend when it works', async () => {
    const sampled = new SampledFake()
    const synth = new FakeBackend()
    const b = new OrchestraBackend({ sampled: () => sampled, synth: () => synth })
    await b.init()
    await b.prepare(['violins'])
    expect(sampled.prepared).toEqual([['violins']])
    expect(synth.initCalls).toBe(0)
    expect(b.info.fallbackReason).toBeUndefined()
  })

  it('falls back to the synth — visibly — when the sample library is missing, keeping the mixer state', async () => {
    const sampled = new SampledFake()
    sampled.failInit = new SampleLoadError('The orchestral sample library is missing (HTTP 404).')
    const synth = new FakeBackend()
    const b = new OrchestraBackend({ sampled: () => sampled, synth: () => synth })
    await b.init()
    expect(synth.initCalls).toBe(1)
    expect(sampled.disposed).toBe(true)
    expect(b.info.fallbackReason).toMatch(/missing .*synthesised/i)
  })

  it('falls back when samples fail to download later, and re-applies the gains already set', async () => {
    const sampled = new SampledFake()
    sampled.failPrepare = new SampleLoadError('decode failed')
    const synth = new FakeBackend()
    const b = new OrchestraBackend({ sampled: () => sampled, synth: () => synth })
    await b.init()
    b.setSectionGain('brass', 0.37, 0)
    b.setMasterGain(0.5, 0)
    await b.prepare(['trumpets'])
    expect(synth.initCalls).toBe(1)
    expect(synth.gains.brass).toBe(0.37)
    expect(synth.master).toBe(0.5)
    expect(b.info.fallbackReason).toBeDefined()
  })

  it('a blocked AudioContext is NOT papered over with the synth (it would be blocked too)', async () => {
    const sampled = new SampledFake()
    sampled.failInit = new Error('The browser blocked audio')
    const synth = new FakeBackend()
    await expect(new OrchestraBackend({ sampled: () => sampled, synth: () => synth }).init()).rejects.toThrow(/blocked/)
    expect(synth.initCalls).toBe(0)
  })
})

describe('AudioEngine.prepare', () => {
  const score = () => {
    // minimal one-note MIDI built through the real parser path is heavy; build the Score by hand
    return {
      title: 't', totalBeats: 4, referenceBpm: 100, beatsPerBar: 4, tempoMap: [{ beat: 0, bpm: 100 }], meters: [{ beat: 0, numerator: 4, denominator: 4 }],
      tracks: [], notes: [{ section: 'strings' as const, midi: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, trackId: 0, instrument: 'violas' as const }],
    }
  }
  it('asks the backend for exactly the instruments the score uses and publishes progress', async () => {
    const fake = new SampledFake()
    const engine = new AudioEngine({ createBackend: () => fake })
    await engine.init()
    engine.load(score())
    const states: string[] = []
    engine.store.subscribe(() => states.push(engine.snapshot.samples.state))
    expect(await engine.prepare()).toBe(true)
    expect(fake.prepared).toEqual([['violas']])
    expect(states).toContain('loading')
    expect(engine.snapshot.samples.state).toBe('ready')
  })
  it('a failed load puts the engine in the error state with the reason', async () => {
    const fake = new SampledFake()
    fake.failPrepare = new Error('boom')
    const engine = new AudioEngine({ createBackend: () => fake })
    await engine.init()
    engine.load(score())
    expect(await engine.prepare()).toBe(false)
    expect(engine.snapshot.status).toBe('error')
    expect(engine.snapshot.error).toBe('boom')
  })
  it('a backend without prepare() is simply ready', async () => {
    const engine = new AudioEngine({ createBackend: () => new FakeBackend() })
    await engine.init()
    engine.load(score())
    expect(await engine.prepare()).toBe(true)
  })
  void parseMidi
})
