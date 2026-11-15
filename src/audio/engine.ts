import { createStore, type Store } from '@/lib/store'
import { SECTIONS, type SectionId } from '@/orchestra/sections'
import type { AudioBackend, BackendInfo } from './backend'
import { sectionBrightnessHz, sectionDynamicsGain, velocityScale } from './dynamics'
import { Mixer } from './mixer'
import { barAndBeat, instrumentsUsed, nominalDurationSec, sectionsUsed, type Score } from './score'
import type { InstrumentId } from './instruments'
import { Sequencer, type SequencerOptions } from './sequencer'

export type AudioStatus = 'uninitialized' | 'initializing' | 'ready' | 'error'
export type Transport = 'stopped' | 'playing' | 'paused' | 'finished'

export interface SampleStatus {
  state: 'idle' | 'loading' | 'ready'
  loaded: number
  total: number
  /** Instrument currently being fetched (for the progress label). */
  current: string
}

export interface AudioSnapshot {
  status: AudioStatus
  error: string | null
  transport: Transport
  loaded: { title: string; totalBeats: number; beatsPerBar: number; referenceBpm: number; nominalSec: number; sections: SectionId[]; instruments: InstrumentId[] } | null
  samples: SampleStatus
  positionBeats: number
  bar: number
  beatInBar: number
  /** 0–1 through the piece. */
  progress: number
  elapsedSec: number
  /** Conductor tempo the music is heading to / actually playing (quarter-note BPM). */
  targetBpm: number | null
  currentBpm: number | null
  dynamicsLevel: number
  levels: Record<SectionId, number>
  backend: BackendInfo | null
  /** Notes dropped because the scheduler was too late to play them on time (0 on a healthy machine). */
  lateNotes: number
}

export interface EngineDeps {
  createBackend: () => AudioBackend
  setInterval?: (cb: () => void, ms: number) => unknown
  clearInterval?: (h: unknown) => void
  sequencer?: Partial<SequencerOptions>
  /** Supply a long-lived mixer (so its state survives engine re-creation). */
  mixer?: Mixer
  tickMs?: number
}

const ZERO_LEVELS = (): Record<SectionId, number> => Object.fromEntries(SECTIONS.map((s) => [s.id, 0])) as Record<SectionId, number>
const UI_EVERY_MS = 100
const GAIN_RAMP_S = 0.12
const RESUME_GATE_DELAY_S = 0.08

/**
 * The audio engine: one object that owns the audio graph, the sequencer, the mixer and the clock. Independent of
 * React and of the gesture engine — the conductor bridge only calls `setTargetBpm`, `setDynamicsLevel` and the
 * transport methods. Audio starts only after `init()`, which must be called from a user gesture.
 */
export class AudioEngine {
  readonly store: Store<AudioSnapshot>
  readonly mixer: Mixer

  private backend: AudioBackend | null = null
  private seq: Sequencer | null = null
  private score: Score | null = null
  private timer: unknown = null
  /** Runs while paused so the meters fall to zero instead of freezing at their last reading. */
  private meterTimer: unknown = null
  private lastUi = -Infinity
  private level = 0.58
  private unsubMixer: (() => void) | null = null
  private disposed = false
  private initPromise: Promise<void> | null = null
  private listeners = { finished: new Set<() => void>() }

  constructor(private deps: EngineDeps) {
    this.mixer = deps.mixer ?? new Mixer()
    this.store = createStore<AudioSnapshot>({
      status: 'uninitialized', error: null, transport: 'stopped', loaded: null, positionBeats: 0, bar: 1, beatInBar: 1, progress: 0,
      elapsedSec: 0, targetBpm: null, currentBpm: null, dynamicsLevel: this.level, levels: ZERO_LEVELS(), backend: null, lateNotes: 0, samples: { state: 'idle', loaded: 0, total: 0, current: '' },
    })
  }

  get snapshot(): AudioSnapshot {
    return this.store.get()
  }
  get ready(): boolean {
    return this.snapshot.status === 'ready'
  }
  /** Fires when the piece reaches its end on its own. */
  onFinished(cb: () => void): () => void {
    this.listeners.finished.add(cb)
    return () => this.listeners.finished.delete(cb)
  }

  // ───────────── lifecycle ─────────────

  /** Create the audio graph and start the context. Call from a click/keypress. Safe to call repeatedly; retries after an error. */
  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Audio engine was disposed'))
    if (this.snapshot.status === 'ready') return Promise.resolve()
    if (this.initPromise) return this.initPromise
    this.patch({ status: 'initializing', error: null })
    this.initPromise = (async () => {
      let backend: AudioBackend | null = null
      try {
        backend = this.deps.createBackend()
        await backend.init()
        if (this.disposed) {
          backend.dispose()
          return
        }
        this.backend = backend
        this.unsubMixer = this.mixer.store.subscribe(() => this.applyGains(GAIN_RAMP_S))
        this.applyGains(0)
        this.patch({ status: 'ready', backend: backend.info })
      } catch (e) {
        backend?.dispose()
        this.backend = null
        this.patch({ status: 'error', error: e instanceof Error ? e.message : 'Audio could not be started' })
      } finally {
        this.initPromise = null
      }
    })()
    return this.initPromise
  }

  /** Stop everything and release the audio graph. Idempotent. */
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.stopTimer()
    this.stopMeterDecay()
    this.unsubMixer?.()
    this.unsubMixer = null
    this.backend?.silence()
    this.backend?.dispose()
    this.backend = null
    this.seq = null
    this.listeners.finished.clear()
    this.patch({ status: 'uninitialized', transport: 'stopped', backend: null, levels: ZERO_LEVELS(), currentBpm: null, targetBpm: null })
  }

  // ───────────── score & transport ─────────────

  load(score: Score) {
    if (this.snapshot.transport === 'playing') this.stop()
    this.score = score
    this.seq = new Sequencer(score, this.deps.sequencer, score.referenceBpm)
    this.patch({
      transport: 'stopped', positionBeats: 0, bar: 1, beatInBar: 1, progress: 0, elapsedSec: 0,
      loaded: { title: score.title, totalBeats: score.totalBeats, beatsPerBar: score.beatsPerBar, referenceBpm: score.referenceBpm, nominalSec: nominalDurationSec(score), sections: sectionsUsed(score), instruments: instrumentsUsed(score) },
      samples: { state: 'idle', loaded: 0, total: 0, current: '' },
      targetBpm: score.referenceBpm, currentBpm: score.referenceBpm,
    })
  }

  /**
   * Make the loaded score playable: have the backend download/decode the sounds its instruments need. Safe to call
   * repeatedly (already-loaded instruments are skipped). Resolves false (and sets the error state) if that fails.
   */
  async prepare(): Promise<boolean> {
    const backend = this.backend
    const score = this.score
    if (!backend || !score || this.disposed) return false
    if (!backend.prepare) return true
    const instruments = instrumentsUsed(score)
    this.patch({ samples: { state: 'loading', loaded: 0, total: 0, current: '' } })
    try {
      await backend.prepare(instruments, (p) => {
        if (this.backend === backend) this.patch({ samples: { state: 'loading', loaded: p.loaded, total: p.total, current: p.instrument } })
      })
    } catch (e) {
      if (this.disposed) return false
      this.patch({ status: 'error', error: e instanceof Error ? e.message : 'The orchestra could not be loaded', samples: { state: 'idle', loaded: 0, total: 0, current: '' } })
      return false
    }
    if (this.disposed || this.backend !== backend) return false
    this.patch({ backend: backend.info, samples: { state: 'ready', loaded: this.snapshot.samples.total, total: this.snapshot.samples.total, current: '' } })
    return true
  }

  /** Start from the beginning (or the current position after a stop). Returns false if audio is not ready or nothing is loaded. */
  play(): boolean {
    if (!this.backend || !this.seq || !this.ready) return false
    if (this.seq.state === 'playing') return true
    const now = this.backend.currentTime
    this.backend.unsilence(now)
    this.seq.play(now)
    this.patch({ transport: 'playing' })
    this.startTimer()
    this.tick()
    return true
  }

  pause() {
    if (!this.backend || !this.seq || this.seq.state !== 'playing') return
    this.seq.pause(this.backend.currentTime)
    this.backend.silence()
    this.stopTimer()
    this.refresh(true)
    this.patch({ transport: 'paused' })
    this.startMeterDecay()
  }

  resume(): boolean {
    if (!this.backend || !this.seq || this.seq.state !== 'paused') return false
    const now = this.backend.currentTime
    // Notes queued just before the pause have long since sounded or been cancelled; re-open the gate a moment after.
    this.stopMeterDecay()
    this.backend.unsilence(now + RESUME_GATE_DELAY_S)
    this.seq.play(now)
    this.patch({ transport: 'playing' })
    this.startTimer()
    return true
  }

  /** Immediate stop: silence, rewind to the start. Safe at any time. */
  stop() {
    this.stopTimer()
    this.stopMeterDecay()
    this.backend?.silence()
    this.seq?.stop()
    this.patch({ transport: 'stopped', positionBeats: 0, bar: 1, beatInBar: 1, progress: 0, elapsedSec: 0, levels: ZERO_LEVELS() })
  }

  /** Stop and return the conductor tempo and mix to their starting values. */
  reset() {
    this.stop()
    this.seq?.resetTempo()
    this.mixer.reset()
    this.level = 0.58
    this.applyGains(0)
    this.patch({ targetBpm: this.score?.referenceBpm ?? null, currentBpm: this.score?.referenceBpm ?? null, dynamicsLevel: this.level })
  }

  // ───────────── conductor inputs ─────────────

  /** Conductor tempo in quarter-note BPM. The played tempo glides to it; it never jumps. */
  setTargetBpm(bpm: number) {
    if (!this.seq) return
    this.seq.setTargetBpm(bpm, this.backend?.currentTime ?? 0)
    this.patch({ targetBpm: this.seq.targetBpm })
  }

  /** Dynamics level 0 (pp) … 1 (ff). */
  setDynamicsLevel(level: number) {
    const l = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0))
    if (Math.abs(l - this.level) < 0.003) return
    this.level = l
    this.applyGains(GAIN_RAMP_S)
    this.patch({ dynamicsLevel: l })
  }

  // ───────────── scheduling loop ─────────────

  /** One scheduling step. Called by the timer; public so tests can drive it deterministically. */
  tick() {
    const backend = this.backend
    const seq = this.seq
    if (!backend || !seq || seq.state !== 'playing') return
    try {
      const vs = velocityScale(this.level)
      const state = seq.tick(backend.currentTime, (n) => backend.scheduleNote({ ...n, velocity: Math.min(1, n.velocity * vs) }))
      backend.pump()
      this.refresh(false)
      if (state === 'finished') {
        this.stopTimer()
        this.patch({ transport: 'finished' })
        this.listeners.finished.forEach((cb) => cb())
      }
    } catch (e) {
      this.stopTimer()
      backend.silence()
      this.patch({ status: 'error', error: e instanceof Error ? e.message : 'Playback failed', transport: 'stopped' })
    }
  }

  private refresh(force: boolean) {
    const backend = this.backend
    const seq = this.seq
    const score = this.score
    if (!backend || !seq || !score) return
    const now = backend.currentTime * 1000
    if (!force && now - this.lastUi < UI_EVERY_MS) return
    this.lastUi = now
    const pos = seq.positionAt(backend.currentTime)
    const { bar, beat } = barAndBeat(score, pos)
    this.patch({
      positionBeats: pos, bar, beatInBar: beat, progress: Math.min(1, pos / score.totalBeats), elapsedSec: seq.elapsedPlayingSec,
      currentBpm: seq.currentBpm, targetBpm: seq.targetBpm, levels: backend.getLevels(), lateNotes: seq.droppedLateNotes,
    })
  }

  private applyGains(rampSec: number) {
    const b = this.backend
    if (!b) return
    for (const { id } of SECTIONS) {
      b.setSectionGain(id, this.mixer.sectionGain(id) * sectionDynamicsGain(id, this.level), rampSec)
      b.setSectionBrightness(id, sectionBrightnessHz(id, this.level), rampSec)
    }
    b.setMasterGain(this.mixer.masterGain, rampSec)
  }

  private startTimer() {
    if (this.timer !== null) return
    const si = this.deps.setInterval ?? ((cb: () => void, ms: number) => setInterval(cb, ms))
    this.timer = si(() => this.tick(), this.deps.tickMs ?? 25)
  }
  /** While paused, keep publishing the (decaying) real output levels until every section is quiet. */
  private startMeterDecay() {
    if (this.meterTimer !== null) return
    const si = this.deps.setInterval ?? ((cb: () => void, ms: number) => setInterval(cb, ms))
    this.meterTimer = si(() => {
      this.refresh(true)
      if (Object.values(this.snapshot.levels).every((v) => v < 0.01)) this.stopMeterDecay()
    }, 100)
  }
  private stopMeterDecay() {
    if (this.meterTimer === null) return
    const ci = this.deps.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>))
    ci(this.meterTimer)
    this.meterTimer = null
  }

  private stopTimer() {
    if (this.timer === null) return
    const ci = this.deps.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>))
    ci(this.timer)
    this.timer = null
  }

  private patch(p: Partial<AudioSnapshot>) {
    this.store.set((s) => ({ ...s, ...p }))
  }
}

