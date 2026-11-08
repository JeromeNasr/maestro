import type { SectionId } from '@/orchestra/sections'
import type { AudioBackend, BackendInfo, LoadProgress } from './backend'
import type { InstrumentId } from './instruments'
import { SampledBackend } from './sampledBackend'
import type { ScheduledNote } from './sequencer'
import { ToneBackend } from './toneBackend'

export interface OrchestraBackendDeps {
  sampled?: () => AudioBackend
  synth?: () => AudioBackend
}

/**
 * The app's audio backend: the recorded orchestra (SampledBackend), with the built-in synthesiser (ToneBackend, lazily
 * loaded) as an explicit fallback if the sample library cannot be fetched or decoded. The fallback is never silent: the
 * reason is published in `info.fallbackReason` and shown in the Studio. Mixer/dynamics settings are remembered so they
 * carry over when the fallback takes over.
 */
export class OrchestraBackend implements AudioBackend {
  private active: AudioBackend
  private usingFallback = false
  private reason: string | undefined
  private lastInit: 'none' | 'ok' = 'none'
  private sectionGain = new Map<SectionId, number>()
  private brightness = new Map<SectionId, number>()
  private master: number | null = null

  constructor(private deps: OrchestraBackendDeps = {}) {
    this.active = (deps.sampled ?? (() => new SampledBackend()))()
  }

  get info(): BackendInfo {
    return this.reason ? { ...this.active.info, fallbackReason: this.reason } : this.active.info
  }
  get currentTime() {
    return this.active.currentTime
  }

  async init() {
    try {
      await this.active.init()
    } catch (e) {
      // Only a missing/unreadable sample library justifies the synth. A blocked AudioContext would fail the same way again.
      if (!(e instanceof Error) || e.name !== 'SampleLoadError') throw e
      await this.fallback(e.message)
    }
    this.lastInit = 'ok'
  }

  private async fallback(reason: string) {
    if (this.usingFallback) throw new Error(reason)
    const failed = this.active
    this.active = (this.deps.synth ?? (() => new ToneBackend()))()
    this.usingFallback = true
    this.reason = `${reason} Using the built-in synthesised orchestra instead.`
    failed.silence()
    failed.dispose()
    await this.active.init()
    if (this.lastInit === 'ok') this.replay()
  }

  /** Re-apply the last mixer/dynamics state to the new backend. */
  private replay() {
    for (const [s, g] of this.sectionGain) this.active.setSectionGain(s, g, 0)
    for (const [s, hz] of this.brightness) this.active.setSectionBrightness(s, hz, 0)
    if (this.master !== null) this.active.setMasterGain(this.master, 0)
  }

  async prepare(instruments: InstrumentId[], onProgress?: (p: LoadProgress) => void) {
    if (!this.active.prepare) return
    try {
      await this.active.prepare(instruments, onProgress)
    } catch (e) {
      if (this.usingFallback) throw e
      await this.fallback(e instanceof Error ? e.message : 'The sample library failed to load.')
      this.replay()
    }
  }

  scheduleNote(n: ScheduledNote) {
    this.active.scheduleNote(n)
  }
  pump() {
    this.active.pump()
  }
  setSectionGain(section: SectionId, gain: number, rampSec: number) {
    this.sectionGain.set(section, gain)
    this.active.setSectionGain(section, gain, rampSec)
  }
  setSectionBrightness(section: SectionId, hz: number, rampSec: number) {
    this.brightness.set(section, hz)
    this.active.setSectionBrightness(section, hz, rampSec)
  }
  setMasterGain(gain: number, rampSec: number) {
    this.master = gain
    this.active.setMasterGain(gain, rampSec)
  }
  silence() {
    this.active.silence()
  }
  unsilence(atSec: number) {
    this.active.unsilence(atSec)
  }
  getLevels() {
    return this.active.getLevels()
  }
  dispose() {
    this.active.dispose()
  }
}
