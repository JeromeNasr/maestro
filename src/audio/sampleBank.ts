import type { SectionId } from '@/orchestra/sections'

/** Shape of public/samples/manifest.json (written by scripts/samples/build-samples.mjs). */
export interface SustainedSample { file: string; root: number; cents: number; loopStart: number; loopEnd: number; duration: number }
export interface HitLayer { file: string; duration: number }
export interface HitVoice { name: string; root: number | null; cents: number; layers: HitLayer[] }
export type BankEntry =
  | { kind: 'sustained'; section: SectionId; label: string; release: number; samples: SustainedSample[] }
  | { kind: 'hit'; section: SectionId; label: string; voices: HitVoice[] }
export interface SampleManifest {
  /** Content hash of all sample files; versions the offline cache. */
  build?: string
  version: number
  source: { name: string; url: string; commit: string; license: string }
  sampleRate: number
  instruments: Record<string, BankEntry>
}

/**
 * Nearest recorded pitch for a note. Ties go to the LOWER root, i.e. the sample is shifted UP (shifting up keeps the
 * recording's natural character better than slowing it down, and loops get slightly shorter, not longer).
 */
export function nearestSample<T extends { root: number }>(samples: readonly T[], midi: number): T {
  let best = samples[0]
  let bestD = Math.abs(midi - best.root)
  for (const s of samples) {
    const d = Math.abs(midi - s.root)
    if (d < bestD || (d === bestD && s.root < best.root)) {
      best = s
      bestD = d
    }
  }
  return best
}

/** Playback-rate ratio that sounds `midi` from a recording of pitch `root` (+ the recording's tuning correction in cents). */
export const playbackRate = (midi: number, root: number, cents = 0, extraCents = 0): number => 2 ** ((midi - root) / 12 + (cents + extraCents) / 1200)

/** Velocity layer for a hit: 0 = softest … layers-1 = loudest. */
export const layerIndex = (velocity: number, layers: number): number => Math.min(layers - 1, Math.max(0, Math.floor(velocity * layers)))

/** Which drum plays a timpani note: the one whose pitch is closest (so it is shifted the least). */
export function nearestDrum(voices: readonly HitVoice[], midi: number): HitVoice {
  const tuned = voices.filter((v) => v.root !== null)
  return tuned.length ? nearestSample(tuned as (HitVoice & { root: number })[], midi) : voices[0]
}

/** Composer velocity (0–1) → linear gain of one voice. Soft notes are clearly quieter, but never inaudible. */
export const velocityGain = (v: number): number => 0.1 + 0.9 * Math.min(1, Math.max(0, v)) ** 1.5
