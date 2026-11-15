import { InstrumentPreview, playableRange, rangeNotes } from './instrumentPreview'

describe('playableRange / rangeNotes', () => {
  it('never stretches a recording further than 5 down or 7 up, nor beyond the usual range', () => {
    expect(playableRange([28, 67], [30, 55])).toEqual([28, 62])
    expect(playableRange([40, 60], [20, 100])).toEqual([40, 60])
  })
  it('ascends evenly, at most 16 notes, ending on the top note', () => {
    const n = rangeNotes(55, 100)
    expect(n[0]).toBe(55)
    expect(n[n.length - 1]).toBe(100)
    expect(n.length).toBeLessThanOrEqual(17)
    expect(n.every((m, i) => i === 0 || m > n[i - 1])).toBe(true)
    expect(rangeNotes(60, 60)).toEqual([60])
  })
})

describe('InstrumentPreview', () => {
  const manifest = { version: 1, source: { name: 'x', url: '', commit: 'abcdef012', license: 'CC0' }, sampleRate: 48000, instruments: {
    violins: { kind: 'sustained', section: 'strings', label: 'v', release: 0.3, samples: [{ file: 'violins/55.ogg', root: 55, cents: 0, loopStart: 0.5, loopEnd: 2, duration: 2 }, { file: 'violins/67.ogg', root: 67, cents: 0, loopStart: 0.5, loopEnd: 2, duration: 2 }] },
    snareDrum: { kind: 'hit', section: 'percussion', label: 's', voices: [{ name: 's', root: null, cents: 0, layers: [{ file: 'snare/0.ogg', duration: 0.5 }, { file: 'snare/1.ogg', duration: 0.5 }] }] },
  } }
  const starts: { rate: number; when: number; buf: unknown }[] = []
  let closed = false
  const ctx = () => ({
    currentTime: 0, destination: {}, resume: async () => {},
    close: async () => { closed = true },
    decodeAudioData: async (b: ArrayBuffer) => ({ id: b.byteLength }),
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }),
    createBufferSource() {
      const s = { buffer: null as unknown, loop: false, loopStart: 0, loopEnd: 0, playbackRate: { value: 1 }, connect() {}, start(when: number) { starts.push({ rate: s.playbackRate.value, when, buf: s.buffer }) }, stop() {}, onended: null }
      return s
    },
  }) as unknown as AudioContext
  beforeEach(() => {
    starts.length = 0
    closed = false
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest })))
  })
  afterEach(() => vi.unstubAllGlobals())
  const make = () => new InstrumentPreview({ baseUrl: '/s/', contextFactory: ctx, fetchBytes: async () => new ArrayBuffer(8) })

  it('lists recorded pitches and re-pitches from the nearest recording', async () => {
    const p = make()
    expect(await p.roots('violins')).toEqual([55, 67])
    await p.load('violins')
    p.note('violins', 61, 1, 1) // 6 above 55, 6 below 67 → tie goes to the lower root, shifted up
    expect(starts[0].rate).toBeCloseTo(2 ** (6 / 12), 6)
    expect(starts[0].when).toBe(1)
    p.close()
    expect(closed).toBe(true)
  })
  it('plays an unpitched drum soft and then loud using different layers', async () => {
    const p = make()
    await p.load('snareDrum')
    p.note('snareDrum', 60, 0, 1, 0.1)
    p.note('snareDrum', 60, 0, 1, 0.95)
    expect(starts[0].buf).not.toBe(starts[1].buf)
    expect(starts.map((s) => s.rate)).toEqual([1, 1])
  })
  it('reports each note and ends with null; stop() cancels a sequence', async () => {
    vi.useFakeTimers()
    const p = make()
    const seen: (number | null)[] = []
    const done = p.playSequence('violins', [{ midi: 60 }, { midi: 64 }], { gap: 0.5, onNote: (m) => seen.push(m) })
    await vi.advanceTimersByTimeAsync(3000)
    await done
    expect(seen).toEqual([60, 64, null])
    const seen2: (number | null)[] = []
    const d2 = p.playSequence('violins', [{ midi: 60 }, { midi: 64 }], { gap: 0.5, onNote: (m) => seen2.push(m) })
    await vi.advanceTimersByTimeAsync(10)
    p.stop()
    await vi.advanceTimersByTimeAsync(3000)
    await d2
    expect(seen2).not.toContain(null)
    vi.useRealTimers()
  })
})
