import { readFileSync } from 'node:fs'
import type { SessionRecord } from '@/analytics/types'
import { parseMidi } from '@/audio/midi'
import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { FakeBackend } from '@/test/fakeAudio'
import { fakeDoc, ManualScheduler, ScriptedDetector, detectorFactory } from '@/test/fakeVision'
import { FakeStream, makeVideo } from '@/test/fakeMedia'
import { CameraController } from '@/vision/camera'
import { DemoSource } from '@/vision/demoSource'
import { ConductingSession } from './conductingSession'

const fetchScore = async (c: { midiUrl?: string; title: string; sectionOverrides?: never }) =>
  parseMidi(new Uint8Array(readFileSync(`public${c.midiUrl}`)), { title: c.title })

function rig() {
  const clock = { t: 1000 }
  const backend = new FakeBackend()
  const scheduler = new ManualScheduler()
  const doc = fakeDoc()
  const timers: (() => void)[] = []
  const cleared: unknown[] = []
  const saved: SessionRecord[] = []
  const video = makeVideo()
  const stream = new FakeStream()
  const demo = new DemoSource({ dropouts: false })
  const detector = new ScriptedDetector((ts) => demo.detect(ts - 1000))
  const camera = new CameraController({ mediaDevices: { getUserMedia: async () => stream as unknown as MediaStream }, isSecureContext: true })
  const session = new ConductingSession({
    createDetector: detectorFactory(detector),
    createBackend: () => backend,
    fetchScore: fetchScore as never,
    camera, scheduler, doc, now: () => clock.t,
    setInterval: (cb) => { timers.push(cb); return cb },
    clearInterval: (h) => void cleared.push(h),
    saveRecord: (r) => saved.push(r),
    getConfig: () => DEFAULT_GESTURE_CONFIG,
  })
  session.vision.attachVideo(video)
  /** Advance both clocks by `ms`, run one vision frame and the audio scheduler. */
  const step = (ms = 33) => {
    clock.t += ms
    backend.now += ms / 1000
    video.__setTime(video.currentTime + ms / 1000)
    scheduler.step()
    timers.forEach((cb) => cb())
  }
  const run = (sec: number) => {
    for (let i = 0; i < (sec * 1000) / 33; i++) step()
  }
  return { session, backend, clock, scheduler, doc, saved, step, run, demo, detector, video, stream, timers, cleared, camera }
}

async function ready() {
  const r = rig()
  r.session.activate()
  await vi.waitFor(() => expect(r.session.snapshot.load).toBe('ready'))
  return r
}

describe('ConductingSession — loading and setup', () => {
  it('loads the default composition and maps its tracks to the four sections', async () => {
    const { session } = await ready()
    const s = session.snapshot
    expect(s.composition!.id).toBe('aurora-etude')
    expect(s.tracks.length).toBe(10)
    expect(new Set(s.tracks.map((t) => t.section))).toEqual(new Set(['strings', 'woodwinds', 'brass', 'percussion']))
    expect(session.audioSnapshot.loaded).toMatchObject({ title: 'Aurora Étude', beatsPerBar: 4 })
    expect(s.timeSignature).toBe('4/4')
  })

  it('does not touch the camera or initialise audio until asked', async () => {
    const { backend, stream, session } = await ready()
    expect(backend.initCalls).toBe(0)
    expect(stream.track.stop).not.toHaveBeenCalled()
    expect(session.vision.store.get().status).toBe('idle')
    expect(session.audioSnapshot.status).toBe('uninitialized')
  })

  it('switches composition (and its time signature); refuses planned pieces', async () => {
    const { session } = await ready()
    expect(await session.selectComposition('evening-minuet')).toBe(true)
    expect(session.snapshot.timeSignature).toBe('3/4')
    expect(session.audioSnapshot.loaded!.beatsPerBar).toBe(3)
    expect(await session.selectComposition('bach-brandenburg-3')).toBe(false)
    expect(session.snapshot.composition!.id).toBe('evening-minuet')
  })

  it('reports a load failure and refuses to start', async () => {
    const r = rig()
    ;(r.session as unknown as { deps: { fetchScore: () => Promise<never> } }).deps.fetchScore = () => Promise.reject(new Error('Could not load /midi/x.mid (HTTP 404).'))
    r.session.activate()
    await vi.waitFor(() => expect(r.session.snapshot.load).toBe('error'))
    expect(r.session.snapshot.loadError).toMatch(/404/)
    expect(await r.session.start()).toBe(false)
  })

  it('conducting options: a 4/4 piece can be conducted in two; others only in their own meter; locked while playing', async () => {
    const { session } = await ready()
    session.setTimeSignature('2/4')
    expect(session.snapshot.timeSignature).toBe('2/4')
    session.setTimeSignature('3/4') // not offered for this piece
    expect(session.snapshot.timeSignature).toBe('2/4')
    session.setTimeSignature('4/4')
    await session.start()
    session.setTimeSignature('2/4')
    expect(session.snapshot.timeSignature).toBe('4/4') // locked during playback
  })
})

describe('ConductingSession — audio starts only on an explicit action, and playback is real', () => {
  it('start() initialises audio, plays, and schedules notes through the audio backend', async () => {
    const { session, backend, run } = await ready()
    expect(await session.start()).toBe(true)
    expect(backend.initCalls).toBe(1)
    expect(session.transport).toBe('playing')
    run(3)
    expect(backend.notes.length).toBeGreaterThan(5)
    expect(session.audioSnapshot.positionBeats).toBeGreaterThan(3)
  })

  it('audio initialisation failure is reported, not hidden', async () => {
    const r = await ready()
    r.backend.failInit = new Error('The browser blocked audio. Click Start again.')
    expect(await r.session.start()).toBe(false)
    expect(r.session.snapshot.notice).toMatch(/blocked audio/)
    expect(r.session.transport).toBe('stopped')
  })

  it('pause silences immediately, resume continues, stop silences and rewinds', async () => {
    const { session, backend, run } = await ready()
    await session.start()
    run(2)
    session.pause()
    expect(session.transport).toBe('paused')
    expect(backend.silenced).toBe(true)
    session.resume()
    expect(session.transport).toBe('playing')
    run(1)
    session.stop()
    expect(session.transport).toBe('stopped')
    expect(backend.silenced).toBe(true)
    expect(session.audioSnapshot.positionBeats).toBe(0)
  })

  it('section mute / solo / volume (owned by the session) reach the audio graph', async () => {
    const { session, backend } = await ready()
    await session.enableAudio()
    const before = backend.gains.brass
    session.mixer.setMuted('brass', true)
    expect(backend.gains.brass).toBe(0)
    session.mixer.setMuted('brass', false)
    expect(backend.gains.brass).toBeCloseTo(before)
    session.mixer.setSolo('strings', true)
    expect(backend.gains.woodwinds).toBe(0)
    expect(backend.gains.strings).toBeGreaterThan(0)
  })
})

describe('ConductingSession — the conductor drives the music (demo conductor → full chain)', () => {
  it('tempo follows the right hand: the played tempo converges on the conducted BPM', async () => {
    const r = await ready()
    r.session.setDemoBpm(100)
    r.session.setDemoDropouts(false)
    r.session.startDemo()
    await r.session.start()
    r.run(30)
    const a = r.session.audioSnapshot
    expect(a.targetBpm!).toBeGreaterThan(95)
    expect(a.targetBpm!).toBeLessThan(105)
    expect(a.currentBpm!).toBeGreaterThan(93)
    expect(r.session.gestureSnapshot.state).toBe('conducting')
    expect(r.session.snapshot.lastBeat).not.toBeNull()
  })

  it('a tempo change by the conductor changes how the music is scheduled — never the pitches', async () => {
    const r = await ready()
    r.session.setDemoBpm(70)
    r.session.setDemoDropouts(false)
    r.session.startDemo()
    await r.session.start()
    r.run(28)
    const slowBeats = r.session.audioSnapshot.positionBeats
    const slowTarget = r.session.audioSnapshot.targetBpm!
    const notesBefore = r.backend.notes.length
    r.session.setDemoBpm(120)
    r.run(28)
    const fastTarget = r.session.audioSnapshot.targetBpm!
    expect(slowTarget).toBeCloseTo(70, -1)
    expect(fastTarget).toBeGreaterThan(110)
    // position advanced noticeably faster in the second half
    expect(r.session.audioSnapshot.positionBeats - slowBeats).toBeGreaterThan(slowBeats * 1.4)
    // every scheduled note still carries its score pitch: same MIDI numbers regardless of tempo
    const score = parseMidi(new Uint8Array(readFileSync('public/midi/aurora-etude.mid')))
    const byBeat = new Map<string, number>()
    for (const n of score.notes) byBeat.set(`${n.section}|${n.startBeat}|${n.midi}`, 1)
    expect(r.backend.notes.length).toBeGreaterThan(notesBefore)
    for (const n of r.backend.notes.slice(0, 200)) expect(byBeat.has(`${n.section}|${n.beat}|${n.midi}`)).toBe(true)
  })

  it('conducting in two: a 4/4 piece conducted at 50 beats/min plays at 100 quarter-notes/min', async () => {
    const r = await ready()
    r.session.setTimeSignature('2/4')
    r.session.setDemoBpm(50)
    r.session.setDemoDropouts(false)
    r.session.startDemo()
    await r.session.start()
    r.run(30)
    expect(r.session.audioSnapshot.targetBpm!).toBeGreaterThan(94)
    expect(r.session.audioSnapshot.targetBpm!).toBeLessThan(106)
  })

  it('the left hand sets the dynamics, and dynamics change every section\'s gain', async () => {
    const r = await ready()
    r.session.setDemoDropouts(false)
    r.session.setDemoLeftLevel(0.08)
    r.session.startDemo()
    await r.session.start()
    r.run(8)
    const quiet = { ...r.backend.gains }
    expect(r.session.gestureSnapshot.dynamics.mark).toBe('pp')
    r.session.setDemoLeftLevel(0.95)
    r.run(6)
    expect(r.session.gestureSnapshot.dynamics.mark).toBe('ff')
    for (const id of ['strings', 'woodwinds', 'brass', 'percussion'] as const) expect(r.backend.gains[id]).toBeGreaterThan(quiet[id] * 4)
    expect(r.session.audioSnapshot.dynamicsLevel).toBeGreaterThan(0.85)
  })

  it('fixed-tempo mode ignores the conductor\'s tempo and plays at a set percentage of the score tempo', async () => {
    const r = await ready()
    r.session.setTempoMode('fixed')
    r.session.setFixedTempoPct(120)
    r.session.setDemoBpm(140)
    r.session.setDemoDropouts(false)
    r.session.startDemo()
    await r.session.start()
    r.run(20)
    expect(r.session.audioSnapshot.targetBpm!).toBeCloseTo(84 * 1.2, 0)
  })

  it('the full camera path works too: fake camera + scripted detector → same conducting chain', async () => {
    const r = await ready()
    await r.session.vision.startCamera()
    expect(r.session.vision.store.get()).toMatchObject({ status: 'running', source: 'camera' })
    await r.session.start()
    r.run(30)
    expect(r.session.audioSnapshot.targetBpm!).toBeGreaterThan(65) // the scripted hand conducts at the DemoSource default, 72 BPM
    expect(r.session.audioSnapshot.targetBpm!).toBeLessThan(80)
    r.session.stop()
    expect(r.saved).toHaveLength(1)
    expect(r.saved[0].source).toBe('camera')
  })
})

describe('ConductingSession — cues stay available during conducting', () => {
  const still = (y: number) => ({ right: () => ({ x: 0.75, y }), left: () => ({ x: 0.25, y }) })

  it('both hands raised starts the piece (audio already enabled by a click)', async () => {
    const r = await ready()
    await r.session.enableAudio()
    r.session.vision.startDemo({ paths: still(0.3), dropouts: false })
    r.run(3)
    await vi.waitFor(() => expect(r.session.transport).toBe('playing')) // the start cue initialises audio asynchronously
  })

  it('a start cue before audio is enabled is not silently dropped: the user is told why', async () => {
    const r = await ready()
    r.session.vision.startDemo({ paths: still(0.3), dropouts: false })
    r.run(3)
    expect(r.session.transport).toBe('stopped')
    expect(r.session.snapshot.notice).toMatch(/Audio is not enabled/)
  })

  it('while playing: raising both hands pauses, again resumes, lowering both stops', async () => {
    const r = await ready()
    r.session.setDemoDropouts(false)
    r.session.setDemoBpm(90)
    r.session.startDemo()
    await r.session.start()
    r.run(20)
    expect(r.session.transport).toBe('playing')
    // pause via the cue
    r.session.vision.startDemo({ paths: still(0.3), dropouts: false })
    r.run(2)
    expect(r.session.transport).toBe('paused')
    // …and resume: release the pose first, then raise again
    r.session.vision.startDemo({ paths: { right: () => ({ x: 0.75, y: 0.55 }), left: () => ({ x: 0.25, y: 0.55 }) }, dropouts: false })
    r.run(1)
    r.session.vision.startDemo({ paths: still(0.3), dropouts: false })
    r.run(2)
    expect(r.session.transport).toBe('playing')
    // lower both and hold: stop
    r.session.vision.startDemo({ paths: still(0.75), dropouts: false })
    r.run(3)
    expect(r.session.transport).toBe('stopped')
  })

  it('normal conducting never triggers a cue (30 s with the left hand high, then low)', async () => {
    const r = await ready()
    r.session.setDemoDropouts(false)
    r.session.setDemoBpm(95)
    r.session.setDemoLeftLevel(0.95)
    r.session.startDemo()
    await r.session.start()
    r.run(15)
    r.session.setDemoLeftLevel(0.02)
    r.run(15)
    expect(r.session.transport).toBe('playing')
  })
})

describe('ConductingSession — recording a performance', () => {
  it('stopping after a real performance saves a record with measured values', async () => {
    const r = await ready()
    r.session.setDemoBpm(100)
    r.session.setDemoDropouts(false)
    r.session.setDemoLeftLevel(0.76)
    r.session.startDemo()
    await r.session.start()
    r.run(40)
    r.session.stop()
    expect(r.saved).toHaveLength(1)
    const rec = r.saved[0]
    expect(rec).toMatchObject({ version: 2, compositionId: 'aurora-etude', source: 'demo', completed: false, timeSignature: '4/4' })
    expect(rec.playingSec).toBeGreaterThan(35)
    expect(rec.beats.accepted).toBeGreaterThan(40)
    expect(rec.tempo.averageBpm!).toBeGreaterThan(90)
    expect(rec.tempo.consistency!).toBeGreaterThan(0.7)
    expect(rec.dynamics!.secondsByMark.f).toBeGreaterThan(20)
    expect(rec.tracking.both!).toBeGreaterThan(0.95)
    expect(r.session.snapshot.summary).toBe(rec)
  })

  it('playback with NO hands is recorded as such: tracking and tempo metrics are unavailable, not perfect', async () => {
    const r = await ready()
    await r.session.start()
    r.run(12)
    r.session.stop()
    const rec = r.saved[0]
    expect(rec.source).toBe('none')
    expect(rec.tracking).toEqual({ frames: 0, right: null, left: null, both: null, meanConfidence: null })
    expect(rec.tempo.averageBpm).toBeNull()
    expect(rec.tempo.consistency).toBeNull()
    expect(rec.patternAdherence).toBeNull()
    expect(rec.dynamics).toBeNull()
    expect(rec.playingSec).toBeGreaterThan(10)
  })

  it('a very short performance is not recorded, and the user is told', async () => {
    const r = await ready()
    await r.session.start()
    r.run(2)
    r.session.stop()
    expect(r.saved).toHaveLength(0)
    expect(r.session.snapshot.summaryNote).toMatch(/too short/)
  })

  it('pauses are not counted as playing time', async () => {
    const r = await ready()
    await r.session.start()
    r.run(8)
    r.session.pause()
    r.run(30) // a long pause
    r.session.resume()
    r.run(2)
    r.session.stop()
    expect(r.saved[0].playingSec).toBeLessThan(13)
  })

  it('a piece that plays to its end is recorded as completed', async () => {
    const r = await ready()
    await r.session.selectComposition('evening-minuet')
    r.session.setTempoMode('fixed')
    r.session.setFixedTempoPct(150)
    await r.session.start()
    r.run(100)
    expect(r.session.audioSnapshot.transport).toBe('finished')
    expect(r.saved).toHaveLength(1)
    expect(r.saved[0]).toMatchObject({ completed: true, compositionId: 'evening-minuet' })
  })
})

describe('ConductingSession — reliability and cleanup', () => {
  it('a hidden tab pauses playback and says so', async () => {
    const r = await ready()
    await r.session.start()
    r.run(3)
    r.doc.hidden = true
    r.doc.fire()
    expect(r.session.transport).toBe('paused')
    expect(r.session.snapshot.notice).toMatch(/tab was hidden/)
  })

  it('deactivate releases camera, detector, audio graph, timers and listeners — and records an unfinished performance', async () => {
    const r = await ready()
    await r.session.vision.startCamera()
    await r.session.start()
    r.run(10)
    r.session.deactivate()
    expect(r.stream.track.stop).toHaveBeenCalled()
    expect(r.detector.closed).toBe(true)
    expect(r.backend.disposed).toBe(true)
    expect(r.backend.silenced).toBe(true)
    expect(r.cleared.length).toBeGreaterThan(0)
    expect(r.doc.listeners.size).toBe(0)
    expect(r.scheduler.count).toBe(0)
    expect(r.session.vision.store.get().status).toBe('idle')
    expect(r.saved).toHaveLength(1)
    expect(r.saved[0].completed).toBe(false)
    r.session.deactivate() // idempotent
  })

  it('can be re-activated after deactivate (React StrictMode) and works again', async () => {
    const r = await ready()
    r.session.deactivate()
    r.backend.disposed = false
    r.session.activate()
    await vi.waitFor(() => expect(r.session.snapshot.load).toBe('ready'))
    expect(await r.session.start()).toBe(true)
    r.run(2)
    expect(r.backend.notes.length).toBeGreaterThan(0)
  })

  it('reset returns tempo mode, mix and conducting state to their defaults', async () => {
    const r = await ready()
    r.session.setTempoMode('fixed')
    r.session.mixer.setMuted('brass', true)
    r.session.reset()
    expect(r.session.snapshot.tempoMode).toBe('follow')
    expect(r.session.mixer.audible('brass')).toBe(true)
  })
})

describe('ConductingSession — unrecognised gestures are explained', () => {
  it('every reason the recogniser can give for ignoring a stroke has a plain-language hint', async () => {
    const { REJECT_HINT } = await import('@/components/studio/FeedbackPanel')
    for (const reason of ['too-small', 'too-slow', 'too-brief', 'too-soon', 'off-pattern', 'awaiting-downbeat']) expect(REJECT_HINT[reason], reason).toBeTruthy()
  })
})
