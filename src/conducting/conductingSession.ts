import { addRecord } from '@/analytics/historyStore'
import type { SessionRecord } from '@/analytics/types'
import type { AudioBackend } from '@/audio/backend'
import { AudioEngine, type AudioSnapshot } from '@/audio/engine'
import { Mixer } from '@/audio/mixer'
import { parseMidi } from '@/audio/midi'
import type { Score, ScoreTrack } from '@/audio/score'
import type { SequencerOptions } from '@/audio/sequencer'
import type { GestureConfig, TimeSignature } from '@/config/gestureConfig'
import type { CueKind, GestureSnapshot } from '@/gesture/types'
import { createStore, type Store } from '@/lib/store'
import { COMPOSITIONS, getComposition } from '@/library/compositions'
import { selectedCompositionId } from '@/library/selection'
import type { Composition } from '@/library/types'
import type { CameraController } from '@/vision/camera'
import type { DetectorFactory } from '@/vision/detector'
import { VisionSession, type FrameScheduler } from '@/vision/visionSession'
import { ConductorBridge, quartersPerBeat, type TempoMode } from './conductorBridge'
import { GestureInput, type Processed } from './gestureInput'
import { SessionRecorder } from './sessionRecorder'

export interface ConductingSessionDeps {
  createDetector: DetectorFactory
  createBackend: () => AudioBackend
  /** Loads and parses a composition's MIDI. Default: fetch(midiUrl) → parseMidi. */
  fetchScore?: (c: Composition) => Promise<Score>
  camera?: CameraController
  scheduler?: FrameScheduler
  now?: () => number
  setInterval?: (cb: () => void, ms: number) => unknown
  clearInterval?: (h: unknown) => void
  getConfig?: () => GestureConfig
  sequencer?: Partial<SequencerOptions>
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener'> & { hidden: boolean }
  /** Where finished performances are stored. Default: the persisted history. */
  saveRecord?: (r: SessionRecord) => void
  clock?: () => Date
}

export interface DemoSettings {
  bpm: number
  /** null = the left hand slowly waves up and down by itself. */
  leftLevel: number | null
  dropouts: boolean
}

export interface StudioSnapshot {
  composition: Composition | null
  load: 'idle' | 'loading' | 'ready' | 'error'
  loadError: string | null
  tracks: ScoreTrack[]
  timeSignature: TimeSignature
  tempoMode: TempoMode
  /** Fixed-tempo mode: percent of the score's own tempo. */
  fixedTempoPct: number
  /** The most recent beat (for the beat indicator); `seq` changes on every beat. */
  lastBeat: { seq: number; beatInBar: number; confidence: number; usedForTempo: boolean } | null
  /** Short messages for the user (audio blocked, tab hidden, cue ignored…). */
  notice: string | null
  /** The just-finished performance, as recorded (null until one ends). */
  summary: SessionRecord | null
  /** Why a finished performance was not recorded, if applicable. */
  summaryNote: string | null
  demo: DemoSettings
}

const DEFAULT_DEMO: DemoSettings = { bpm: 84, leftLevel: null, dropouts: true }

const defaultFetchScore = async (c: Composition): Promise<Score> => {
  if (!c.midiUrl) throw new Error(`“${c.title}” has no MIDI arrangement yet.`)
  const res = await fetch(c.midiUrl)
  if (!res.ok) throw new Error(`Could not load ${c.midiUrl} (HTTP ${res.status}).`)
  return parseMidi(await res.arrayBuffer(), { title: c.title, overrides: c.sectionOverrides })
}

/**
 * One conducting performance end to end:
 *   camera/demo → VisionSession → GestureInput (GestureEngine) → ConductorBridge → AudioEngine,
 * with the SessionRecorder watching. Owns every lifecycle (camera tracks, detector, audio graph, timers, listeners) and
 * guarantees they are released on `deactivate()` (leaving the Studio) — it never leaves the camera or audio running.
 */
export class ConductingSession {
  readonly vision: VisionSession
  readonly gesture: GestureInput
  readonly mixer = new Mixer()
  readonly store: Store<StudioSnapshot>
  /** Stable proxy of the (re-creatable) audio engine's state. */
  readonly audioStore: Store<AudioSnapshot>

  private audio: AudioEngine | null = null
  private score: Score | null = null
  private bridge: ConductorBridge
  private recorder = new SessionRecorder()
  private active = false
  private loadToken = 0
  private beatSeq = 0
  private unsubs: (() => void)[] = []
  private starting = false

  constructor(private deps: ConductingSessionDeps) {
    this.vision = new VisionSession({ createDetector: deps.createDetector, camera: deps.camera, scheduler: deps.scheduler, now: deps.now, getConfig: deps.getConfig, doc: deps.doc })
    this.gesture = new GestureInput(this.vision, deps.getConfig)
    const saved = getComposition(selectedCompositionId.get())
    const first = (saved?.status === 'available' ? saved : COMPOSITIONS.find((c) => c.status === 'available')) ?? null
    this.store = createStore<StudioSnapshot>({
      composition: first, load: 'idle', loadError: null, tracks: [], timeSignature: first?.timeSignature ?? '4/4', tempoMode: 'follow', fixedTempoPct: 100,
      lastBeat: null, notice: null, summary: null, summaryNote: null, demo: DEFAULT_DEMO,
    })
    this.audioStore = createStore<AudioSnapshot>(new AudioEngine({ createBackend: deps.createBackend }).snapshot)
    this.bridge = new ConductorBridge(
      { setTargetBpm: (b) => this.audio?.setTargetBpm(b), setDynamicsLevel: (l) => this.audio?.setDynamicsLevel(l) },
      { state: () => this.audio?.snapshot.transport ?? 'stopped', start: () => void this.start(true), pause: () => this.pause(), resume: () => this.resume(), stop: () => this.stop() },
      { quartersPerBeat: () => this.quartersPerBeat(), tempoMode: () => this.store.get().tempoMode, onCue: (cue, applied) => this.onCue(cue, applied) },
    )
  }

  get snapshot(): StudioSnapshot {
    return this.store.get()
  }
  get audioSnapshot(): AudioSnapshot {
    return this.audioStore.get()
  }
  get gestureSnapshot(): GestureSnapshot {
    return this.gesture.store.get()
  }
  get transport() {
    return this.audio?.snapshot.transport ?? 'stopped'
  }

  // ───────────── lifecycle ─────────────

  activate() {
    if (this.active) return
    this.active = true
    const engine = new AudioEngine({ createBackend: this.deps.createBackend, mixer: this.mixer, sequencer: this.deps.sequencer, setInterval: this.deps.setInterval, clearInterval: this.deps.clearInterval })
    this.audio = engine
    this.audioStore.set(engine.snapshot)
    this.unsubs.push(
      engine.store.subscribe(() => {
        this.audioStore.set(engine.snapshot)
        this.gesture.setTransport(engine.snapshot.transport === 'playing' ? 'playing' : engine.snapshot.transport === 'paused' ? 'paused' : 'stopped')
        if (engine.snapshot.status === 'error' && engine.snapshot.error) this.notify(engine.snapshot.error)
      }),
      engine.onFinished(() => this.onFinished()),
    )
    this.gesture.activate()
    this.unsubs.push(this.gesture.onProcessed((p) => this.onGesture(p)))
    const doc = this.deps.doc ?? (typeof document !== 'undefined' ? document : null)
    if (doc) {
      const onVis = () => {
        if (doc.hidden && this.transport === 'playing') {
          this.pause()
          this.notify('Paused because the tab was hidden (camera tracking pauses too). Resume when you are back.')
        }
      }
      doc.addEventListener('visibilitychange', onVis)
      this.unsubs.push(() => doc.removeEventListener('visibilitychange', onVis))
    }
    const c = this.store.get().composition
    if (c) void this.selectComposition(c.id)
  }

  /** Stop everything and release camera, detector, audio graph, timers and listeners. Reusable via activate(). */
  deactivate() {
    if (!this.active) return
    this.active = false
    this.loadToken++
    if (this.recorder.active) this.finishRecording(false)
    this.unsubs.splice(0).forEach((u) => u())
    this.gesture.deactivate()
    this.vision.release()
    this.audio?.dispose()
    this.audio = null
    this.audioStore.set(new AudioEngine({ createBackend: this.deps.createBackend }).snapshot)
    this.patch({ lastBeat: null })
  }

  // ───────────── composition & settings ─────────────

  async selectComposition(id: string): Promise<boolean> {
    const c = getComposition(id)
    if (!c || c.status !== 'available') return false
    if (this.transport === 'playing' || this.transport === 'paused') this.stop()
    const token = ++this.loadToken
    this.patch({ composition: c, load: 'loading', loadError: null, summary: null, summaryNote: null })
    try {
      const score = await (this.deps.fetchScore ?? defaultFetchScore)(c)
      if (token !== this.loadToken || !this.active) return false
      this.score = score
      this.audio?.load(score)
      this.patch({ load: 'ready', tracks: score.tracks, timeSignature: c.timeSignature })
      this.gesture.setTimeSignature(c.timeSignature)
      this.gesture.reset()
      this.applyFixedTempo()
      return true
    } catch (e) {
      if (token !== this.loadToken) return false
      this.patch({ load: 'error', loadError: e instanceof Error ? e.message : 'The composition could not be loaded.', tracks: [] })
      return false
    }
  }

  /** Choose the conducting pattern (only while not playing). */
  setTimeSignature(ts: TimeSignature) {
    const c = this.store.get().composition
    if (!c || !c.conductingOptions.includes(ts) || this.transport === 'playing') return
    this.patch({ timeSignature: ts })
    this.gesture.setTimeSignature(ts)
    this.vision.setDemoTimeSignature(ts)
  }

  setTempoMode(mode: TempoMode) {
    this.patch({ tempoMode: mode })
    if (mode === 'fixed') this.applyFixedTempo()
  }
  setFixedTempoPct(pct: number) {
    this.patch({ fixedTempoPct: Math.max(50, Math.min(150, pct)) })
    this.applyFixedTempo()
  }
  private applyFixedTempo() {
    const s = this.store.get()
    if (s.tempoMode === 'fixed' && this.score) this.audio?.setTargetBpm((this.score.referenceBpm * s.fixedTempoPct) / 100)
  }

  // ───────────── transport ─────────────

  /** Start (or restart) the piece. Must be called from a user gesture the first time (it initialises audio). */
  async start(fromCue = false): Promise<boolean> {
    const audio = this.audio
    if (!audio || this.starting || !this.score || this.store.get().load !== 'ready') return false
    if (fromCue && !audio.ready) {
      this.notify('Audio is not enabled yet. Press Enable audio (or Start) once — browsers require a click.')
      return false
    }
    this.starting = true
    try {
      await audio.init()
      if (!this.active || audio !== this.audio) return false
      if (audio.snapshot.status !== 'ready') return false
      if (!(await audio.prepare())) return false
      if (!this.active || audio !== this.audio) return false
      if (this.transport === 'playing') return true
      this.gesture.reset()
      this.gesture.setTimeSignature(this.store.get().timeSignature)
      audio.setTargetBpm(this.score.referenceBpm)
      this.applyFixedTempo()
      this.patch({ summary: null, summaryNote: null, notice: null, lastBeat: null })
      const c = this.store.get().composition!
      this.recorder.begin({ compositionId: c.id, compositionTitle: c.title, timeSignature: this.store.get().timeSignature, referenceBpm: this.score.referenceBpm, startedAt: (this.deps.clock ?? (() => new Date()))() })
      const ok = audio.play()
      if (!ok) this.recorder.finish({ playingSec: 0, completed: false })
      return ok
    } finally {
      this.starting = false
    }
  }

  /** Enable audio without starting (lets hand cues start the piece later). Requires a user gesture. */
  async enableAudio(): Promise<boolean> {
    await this.audio?.init()
    if (this.audio?.snapshot.status !== 'ready') return false
    return this.audio.prepare()
  }

  pause() {
    if (this.transport !== 'playing') return
    this.audio?.pause()
    this.recorder.gap()
  }
  resume() {
    if (this.transport !== 'paused') return
    this.audio?.resume()
  }
  /** Immediate stop; records the performance if it was long enough. */
  stop() {
    const audio = this.audio
    if (!audio) return
    const t = this.transport
    if (t === 'stopped' && !this.recorder.active) return
    const playing = audio.snapshot.elapsedSec
    audio.stop()
    if (this.recorder.active) this.finishRecording(false, playing)
  }
  /** Stop, and return tempo, mix and conducting state to their starting values. */
  reset() {
    this.stop()
    this.audio?.reset()
    this.gesture.reset()
    this.patch({ summary: null, summaryNote: null, notice: null, lastBeat: null, tempoMode: 'follow', fixedTempoPct: 100 })
  }

  dismissSummary() {
    this.patch({ summary: null, summaryNote: null })
  }
  dismissNotice() {
    this.patch({ notice: null })
  }

  // ───────────── demo conductor ─────────────

  startDemo() {
    const d = this.store.get().demo
    this.vision.startDemo({ bpm: d.bpm, leftLevel: d.leftLevel ?? 'wave', dropouts: d.dropouts, timeSignature: this.store.get().timeSignature })
  }
  setDemoBpm(bpm: number) {
    const b = Math.max(40, Math.min(200, bpm))
    this.patch({ demo: { ...this.store.get().demo, bpm: b } })
    this.vision.setDemoBpm(b)
  }
  setDemoLeftLevel(level: number | null) {
    this.patch({ demo: { ...this.store.get().demo, leftLevel: level } })
    this.vision.setDemoLeftLevel(level ?? 'wave')
  }
  setDemoDropouts(on: boolean) {
    this.patch({ demo: { ...this.store.get().demo, dropouts: on } })
    if (this.vision.store.get().source === 'demo') this.startDemo() // dropouts are fixed at start: restart the demo conductor
  }

  // ───────────── internals ─────────────

  private quartersPerBeat(): number {
    const c = this.store.get().composition
    return c ? quartersPerBeat(c.timeSignature, this.store.get().timeSignature) : 1
  }

  private onGesture(p: Processed) {
    const playing = this.transport === 'playing'
    if (playing && this.recorder.active) {
      this.recorder.frame(p.snapshot, p.frame.source, p.frame.timestampMs)
      for (const e of p.events) if (e.type === 'beat') this.recorder.beat(e)
    }
    for (const e of p.events) {
      if (e.type === 'beat') this.patch({ lastBeat: { seq: ++this.beatSeq, beatInBar: e.beatInBar, confidence: e.confidence, usedForTempo: e.usedForTempo } })
    }
    this.bridge.handle(p.events, p.snapshot)
  }

  private onCue(cue: CueKind, applied: boolean) {
    // (A start cue is acted on asynchronously and reports its own problems, e.g. "audio is not enabled yet".)
    if (!applied && cue === 'start') this.notify('Start cue ignored: the piece is already playing.')
  }

  private onFinished() {
    const sec = this.audio?.snapshot.elapsedSec ?? 0
    if (this.recorder.active) this.finishRecording(true, sec)
  }

  private finishRecording(completed: boolean, playingSec = this.audio?.snapshot.elapsedSec ?? 0) {
    const rec = this.recorder.finish({ playingSec, completed })
    if (!rec) {
      this.patch({ summary: null, summaryNote: playingSec > 0 ? 'Not recorded: the performance was too short (under 5 seconds) to say anything meaningful.' : null })
      return
    }
    ;(this.deps.saveRecord ?? addRecord)(rec)
    this.patch({ summary: rec, summaryNote: null })
  }

  private notify(msg: string) {
    this.patch({ notice: msg })
  }
  private patch(p: Partial<StudioSnapshot>) {
    this.store.set((s) => ({ ...s, ...p }))
  }
}
