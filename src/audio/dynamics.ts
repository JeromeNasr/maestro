import type { SectionId } from '@/orchestra/sections'

/**
 * How the conductor's continuous dynamics level (0 = pp … 1 = ff) shapes each section.
 * Sections respond differently: brass have the widest dynamic range, percussion the narrowest, and every section also
 * gets brighter when louder (a low-pass filter opens), as real instruments do.
 */
export interface SectionDynamics {
  /** Level 0 is this many dB quieter than level 1. */
  rangeDb: number
  /** Level-1 loudness relative to the mix (balance between sections). */
  offsetDb: number
  /** Low-pass cutoff (Hz) at level 0 and level 1. */
  brightnessHz: [number, number]
}

export const SECTION_DYNAMICS: Record<SectionId, SectionDynamics> = {
  strings: { rangeDb: 20, offsetDb: 0, brightnessHz: [1400, 7000] },
  woodwinds: { rangeDb: 18, offsetDb: -1.5, brightnessHz: [1800, 8000] },
  brass: { rangeDb: 25, offsetDb: -1, brightnessHz: [700, 6500] },
  percussion: { rangeDb: 16, offsetDb: 0, brightnessHz: [1500, 9000] },
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
export const dbToGain = (db: number) => Math.pow(10, db / 20)
export const gainToDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g))

/** Loudness of a section at a dynamics level, in dB relative to level 1 (≤ offset). A perceptually even curve. */
export function sectionDb(section: SectionId, level: number): number {
  const d = SECTION_DYNAMICS[section]
  return d.offsetDb - (1 - clamp01(level)) * d.rangeDb
}

export const sectionDynamicsGain = (section: SectionId, level: number) => dbToGain(sectionDb(section, level))

export function sectionBrightnessHz(section: SectionId, level: number): number {
  const [lo, hi] = SECTION_DYNAMICS[section].brightnessHz
  // exponential interpolation: equal steps in pitch, not in Hz
  return lo * Math.pow(hi / lo, Math.pow(clamp01(level), 1.2))
}

/**
 * The composer's note velocity is also scaled a little by the conductor's level (louder playing hits harder):
 * 0.65 at level 0 up to 1.0 at level 1.
 */
export const velocityScale = (level: number) => 0.65 + 0.35 * clamp01(level)
