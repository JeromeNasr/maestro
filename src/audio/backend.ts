import type { SectionId } from '@/orchestra/sections'
import type { InstrumentId } from './instruments'
import type { ScheduledNote } from './sequencer'

export interface BackendInfo {
  kind: string
  sampleRate?: number
  baseLatencySec?: number
  contextState?: string
  /** Human-readable description of the sound source (shown in the Studio diagnostics). */
  detail?: string
  /** Set when the preferred (sampled) sound could not be used and a fallback is playing instead. */
  fallbackReason?: string
}

export interface LoadProgress { loaded: number; total: number; instrument: string }

/**
 * The only part of the audio system that touches Web Audio. The engine, sequencer, mixer and dynamics logic are pure
 * and are exercised against a recording fake; ToneBackend is the real implementation.
 */
export interface AudioBackend {
  readonly info: BackendInfo
  /** Create the audio graph and start the AudioContext. Must be called from a user gesture. Rejects on failure. */
  init(): Promise<void>
  /** Audio clock, seconds. */
  readonly currentTime: number
  /** Optional: download/decode what these instruments need before they can sound. Resolves when ready; rejects if it cannot. */
  prepare?(instruments: InstrumentId[], onProgress?: (p: LoadProgress) => void): Promise<void>
  /** Queue a note (audio-clock time). Notes are only sounded shortly before they are due, so `silence()` can cancel them. */
  scheduleNote(n: ScheduledNote): void
  /** Called every engine tick: sounds queued notes that are about to be due. */
  pump(): void
  /** Linear gain of a section's bus (mixer × dynamics). */
  setSectionGain(section: SectionId, gain: number, rampSec: number): void
  /** Low-pass cutoff of a section (timbre gets brighter when louder). */
  setSectionBrightness(section: SectionId, hz: number, rampSec: number): void
  setMasterGain(gain: number, rampSec: number): void
  /** Immediately cut sound: cancel queued notes, release all voices, close the output gate. */
  silence(): void
  /** Re-open the output gate at an audio-clock time. */
  unsilence(atSec: number): void
  /** Smoothed output level per section, 0–1 (measured from the actual audio, post-gain). */
  getLevels(): Record<SectionId, number>
  dispose(): void
}
