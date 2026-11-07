import type { BeatEvent, ConductingEvent, GestureSnapshot } from '@/gesture/types'
import { ConductorBridge, quartersPerBeat } from './conductorBridge'
import { MIN_RECORDED_SEC, SessionRecorder } from './sessionRecorder'

const snapshot = (o: Partial<GestureSnapshot> = {}): GestureSnapshot => ({
  timestampMs: 0, state: 'conducting', timeSignature: '4/4', beatInBar: 1, expectedBeat: 2, bpm: 100, rawBpm: 100, tempoStability: 0.9, lastBeatConfidence: 0.9,
  dynamics: { level: 0.6, mark: 'mf', trend: 'steady', source: 'hand' }, rightPresent: true, leftPresent: true, rightConfidence: 0.9, leftConfidence: 0.8,
  cue: { cue: null, progress: 0 }, stats: { beatsAccepted: 0, offPattern: 0, tooSoon: 0, ignored: 0, skippedBeats: 0, resyncs: 0 }, ...o,
})
const beat = (o: Partial<BeatEvent> = {}): BeatEvent => ({
  type: 'beat', index: 1, beatInBar: 1, bar: 1, timestampMs: 0, detectedAtMs: 0, direction: 'down', intervalMs: 600, skipped: 0, resynced: false, confidence: 0.9, usedForTempo: true, ...o,
})

describe('quartersPerBeat', () => {
  it('maps written meter × conducting pattern to quarter notes per conducted beat', () => {
    expect(quartersPerBeat('4/4', '4/4')).toBe(1)
    expect(quartersPerBeat('4/4', '2/4')).toBe(2)
    expect(quartersPerBeat('3/4', '3/4')).toBe(1)
    expect(quartersPerBeat('2/4', '2/4')).toBe(1)
    expect(quartersPerBeat('3/4', '2/4')).toBe(1) // not a clean division: fall back rather than guess
  })
})

describe('ConductorBridge', () => {
  function setup(state: 'stopped' | 'playing' | 'paused' | 'finished', mode: 'follow' | 'fixed' = 'follow', q = 1) {
    const target = { setTargetBpm: vi.fn(), setDynamicsLevel: vi.fn() }
    const transport = { state: () => state, start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn() }
    const onCue = vi.fn()
    const bridge = new ConductorBridge(target, transport, { quartersPerBeat: () => q, tempoMode: () => mode, onCue })
    return { bridge, target, transport, onCue }
  }
  const tempo = (bpm: number): ConductingEvent => ({ type: 'tempo', timestampMs: 0, bpm, rawBpm: bpm, stability: 1 })
  const cue = (c: 'start' | 'stop' | 'pause' | 'resume'): ConductingEvent => ({ type: 'cue', timestampMs: 0, cue: c, source: 'both-hands' })

  it('tempo events set the target BPM (scaled by quarters per beat) in follow mode only', () => {
    const f = setup('playing', 'follow', 2)
    f.bridge.handle([tempo(55)], snapshot())
    expect(f.target.setTargetBpm).toHaveBeenCalledWith(110)
    const x = setup('playing', 'fixed')
    x.bridge.handle([tempo(55)], snapshot())
    expect(x.target.setTargetBpm).not.toHaveBeenCalled()
  })

  it('dynamics level is forwarded every frame', () => {
    const { bridge, target } = setup('playing')
    bridge.handle([], snapshot({ dynamics: { level: 0.83, mark: 'ff', trend: 'steady', source: 'hand' } }))
    expect(target.setDynamicsLevel).toHaveBeenCalledWith(0.83)
  })

  it.each([
    ['start', 'stopped', 'start'], ['start', 'finished', 'start'], ['pause', 'playing', 'pause'], ['resume', 'paused', 'resume'], ['stop', 'playing', 'stop'], ['stop', 'paused', 'stop'],
  ] as const)('cue %s while %s → transport.%s', (c, state, method) => {
    const { bridge, transport, onCue } = setup(state)
    bridge.handle([cue(c)], snapshot())
    expect(transport[method]).toHaveBeenCalledTimes(1)
    expect(onCue).toHaveBeenCalledWith(c, true)
  })

  it.each([
    ['start', 'playing'], ['start', 'paused'], ['pause', 'stopped'], ['pause', 'paused'], ['resume', 'playing'], ['resume', 'stopped'], ['stop', 'stopped'], ['stop', 'finished'],
  ] as const)('cue %s while %s is validated against the transport state and ignored', (c, state) => {
    const { bridge, transport, onCue } = setup(state)
    bridge.handle([cue(c)], snapshot())
    for (const m of ['start', 'pause', 'resume', 'stop'] as const) expect(transport[m]).not.toHaveBeenCalled()
    expect(onCue).toHaveBeenCalledWith(c, false)
  })
})

describe('SessionRecorder — honest metrics', () => {
  const meta = { compositionId: 'x', compositionTitle: 'X', timeSignature: '4/4' as const, referenceBpm: 84, startedAt: new Date('2026-01-01T10:00:00Z') }
  const feed = (r: SessionRecorder, seconds: number, make: (t: number) => GestureSnapshot, source: 'camera' | 'demo' | null = 'camera') => {
    for (let t = 0; t <= seconds * 1000; t += 33) r.frame(make(t), source, t)
  }

  it('returns nothing for a performance shorter than the minimum', () => {
    const r = new SessionRecorder()
    r.begin(meta)
    feed(r, 3, () => snapshot())
    expect(r.finish({ playingSec: MIN_RECORDED_SEC - 0.1, completed: false })).toBeNull()
  })

  it('measures tracking as the fraction of frames each hand was seen (missing data is NOT perfect)', () => {
    const r = new SessionRecorder()
    r.begin(meta)
    // right hand seen 100% of the time, left only the first 40%
    feed(r, 10, (t) => snapshot({ leftPresent: t < 4000, leftConfidence: 0.8 }))
    const rec = r.finish({ playingSec: 10, completed: false })!
    expect(rec.tracking.right).toBeCloseTo(1, 2)
    expect(rec.tracking.left!).toBeGreaterThan(0.35)
    expect(rec.tracking.left!).toBeLessThan(0.45)
    expect(rec.tracking.both!).toBeCloseTo(rec.tracking.left!, 2)
    expect(rec.tracking.meanConfidence!).toBeGreaterThan(0.8)
  })

  it('time-weights the average BPM and tracks min/max', () => {
    const r = new SessionRecorder()
    r.begin(meta)
    feed(r, 10, (t) => snapshot({ bpm: t < 7500 ? 80 : 120 })) // 75 % at 80, 25 % at 120
    const rec = r.finish({ playingSec: 10, completed: false })!
    expect(rec.tempo.averageBpm!).toBeCloseTo(90, 0)
    expect(rec.tempo.minBpm).toBe(80)
    expect(rec.tempo.maxBpm).toBe(120)
    expect(rec.tempo.series.length).toBeGreaterThanOrEqual(4)
    expect(rec.tempo.series.length).toBeLessThanOrEqual(120)
  })

  it('consistency: even beats score high, jittery beats low, too few beats = unavailable', () => {
    const even = new SessionRecorder()
    even.begin(meta)
    feed(even, 6, () => snapshot())
    for (let i = 0; i < 10; i++) even.beat(beat({ intervalMs: 600 }))
    const evenRec = even.finish({ playingSec: 10, completed: false })!
    expect(evenRec.tempo.consistency).toBeCloseTo(1, 2)
    expect(evenRec.tempo.intervalCv).toBeCloseTo(0, 2)

    const jitter = new SessionRecorder()
    jitter.begin(meta)
    feed(jitter, 6, () => snapshot())
    ;[500, 700, 480, 720, 520, 690, 510, 700].forEach((ms) => jitter.beat(beat({ intervalMs: ms })))
    expect(jitter.finish({ playingSec: 10, completed: false })!.tempo.consistency!).toBeLessThan(0.3)

    const few = new SessionRecorder()
    few.begin(meta)
    feed(few, 6, () => snapshot())
    few.beat(beat())
    few.beat(beat())
    const fewRec = few.finish({ playingSec: 10, completed: false })!
    expect(fewRec.tempo.consistency).toBeNull()
    expect(fewRec.tempo.intervalCv).toBeNull()
  })

  it('an intentional steady accelerando is not punished as inconsistency', () => {
    const r = new SessionRecorder()
    r.begin(meta)
    feed(r, 6, () => snapshot())
    for (let i = 0; i < 12; i++) r.beat(beat({ intervalMs: 700 - i * 20 })) // each beat 20 ms faster
    expect(r.finish({ playingSec: 10, completed: false })!.tempo.consistency!).toBeGreaterThan(0.7)
  })

  it('beat counts and pattern adherence come from the engine\'s classification', () => {
    const r = new SessionRecorder()
    r.begin(meta)
    feed(r, 6, () => snapshot({ stats: { beatsAccepted: 0, offPattern: 5, tooSoon: 0, ignored: 0, skippedBeats: 1, resyncs: 2 } }))
    for (let i = 0; i < 15; i++) r.beat(beat({ usedForTempo: i % 5 !== 0 }))
    const rec = r.finish({ playingSec: 10, completed: true })!
    expect(rec.beats).toMatchObject({ accepted: 15, usedForTempo: 12, offPattern: 5, resyncs: 2, skipped: 1 })
    expect(rec.patternAdherence).toBeCloseTo(15 / 20)
    expect(rec.completed).toBe(true)
  })

  it('dynamics: time at each marking while the left hand is tracked; held time is separate', () => {
    const r = new SessionRecorder()
    r.begin(meta)
    feed(r, 10, (t) =>
      t < 5000
        ? snapshot({ dynamics: { level: 0.25, mark: 'p', trend: 'steady', source: 'hand' } })
        : t < 8000
          ? snapshot({ dynamics: { level: 0.9, mark: 'ff', trend: 'steady', source: 'hand' } })
          : snapshot({ leftPresent: false, dynamics: { level: 0.9, mark: 'ff', trend: 'steady', source: 'hold' } }),
    )
    const rec = r.finish({ playingSec: 10, completed: false })!
    expect(rec.dynamics!.secondsByMark.p).toBeGreaterThan(4.5)
    expect(rec.dynamics!.secondsByMark.ff).toBeGreaterThan(2.5)
    expect(rec.dynamics!.secondsByMark.ff).toBeLessThan(3.5)
    expect(rec.dynamics!.secondsHeld).toBeGreaterThan(1.5)
    expect(rec.dynamics!.minLevel).toBeCloseTo(0.25)
    expect(rec.dynamics!.maxLevel).toBeCloseTo(0.9)
  })

  it('no hand input at all → source "none" and every conducting metric unavailable', () => {
    const r = new SessionRecorder()
    r.begin(meta)
    feed(r, 10, () => snapshot(), null)
    const rec = r.finish({ playingSec: 10, completed: false })!
    expect(rec.source).toBe('none')
    expect(rec.tracking).toEqual({ frames: 0, right: null, left: null, both: null, meanConfidence: null })
    expect(rec.dynamics).toBeNull()
    expect(rec.patternAdherence).toBeNull()
    expect(rec.tempo.averageBpm).toBeNull()
  })

  it('a stalled clock is not counted as playing time and gaps are handled', () => {
    const r = new SessionRecorder()
    r.begin(meta)
    r.frame(snapshot(), 'camera', 0)
    r.frame(snapshot(), 'camera', 20000) // a 20 s freeze
    r.gap()
    r.frame(snapshot(), 'camera', 20033)
    const rec = r.finish({ playingSec: 6, completed: false })!
    expect(rec.dynamics!.secondsByMark.mf).toBeLessThan(0.5)
  })
})
