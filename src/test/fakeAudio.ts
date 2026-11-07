import type { AudioBackend } from '@/audio/backend'
import type { ScheduledNote } from '@/audio/sequencer'
import type { SectionId } from '@/orchestra/sections'

/** Recording fake of the Web Audio backend with a controllable clock. */
export class FakeBackend implements AudioBackend {
  info = { kind: 'fake', sampleRate: 48000, baseLatencySec: 0.01, contextState: 'running' }
  now = 100
  notes: ScheduledNote[] = []
  gains: Record<SectionId, number> = { strings: 1, woodwinds: 1, brass: 1, percussion: 1 }
  brightness: Record<SectionId, number> = { strings: 0, woodwinds: 0, brass: 0, percussion: 0 }
  master = 1
  silenced = false
  silenceCalls = 0
  unsilenceAt: number[] = []
  pumps = 0
  disposed = false
  initCalls = 0
  failInit: Error | null = null
  gainLog: { section: SectionId; gain: number; ramp: number }[] = []
  /** Meter output the fake reports (tests can set it). */
  meter: Record<SectionId, number> = { strings: 0, woodwinds: 0, brass: 0, percussion: 0 }

  get currentTime() {
    return this.now
  }
  async init() {
    this.initCalls++
    if (this.failInit) throw this.failInit
  }
  scheduleNote(n: ScheduledNote) {
    if (this.silenced) return
    this.notes.push(n)
  }
  pump() {
    this.pumps++
  }
  setSectionGain(section: SectionId, gain: number, ramp: number) {
    this.gains[section] = gain
    this.gainLog.push({ section, gain, ramp })
  }
  setSectionBrightness(section: SectionId, hz: number) {
    this.brightness[section] = hz
  }
  setMasterGain(g: number) {
    this.master = g
  }
  silence() {
    this.silenced = true
    this.silenceCalls++
  }
  unsilence(at: number) {
    this.silenced = false
    this.unsilenceAt.push(at)
  }
  getLevels() {
    return { ...this.meter }
  }
  dispose() {
    this.disposed = true
  }
  /** Notes of one section. */
  of(section: SectionId) {
    return this.notes.filter((n) => n.section === section)
  }
}
