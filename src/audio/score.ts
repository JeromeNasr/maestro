import type { SectionId } from '@/orchestra/sections'

/**
 * Musical score in BEATS (quarter notes), independent of tempo. Tempo only decides how fast beats pass, so changing
 * tempo can never change a note's pitch.
 */
export interface ScoreNote {
  section: SectionId
  /** MIDI note number (pitch is fixed by this alone). */
  midi: number
  startBeat: number
  durationBeats: number
  /** 0–1 (the composer's dynamic marking; the conductor's dynamics scale on top of it). */
  velocity: number
  trackId: number
  /** Drum-kit note (General MIDI channel 10): `midi` selects the drum, not a pitch. */
  kit?: boolean
}

export interface TempoMark { beat: number; bpm: number }
export interface MeterMark { beat: number; numerator: number; denominator: number }

export interface ScoreTrack {
  id: number
  name: string
  /** General MIDI program (0–127) or null. */
  program: number | null
  channel: number
  section: SectionId
  noteCount: number
  /** Why this track was assigned to its section (documented in the Studio and LICENSES/CLAUDE docs). */
  mappedBy: 'override' | 'drum-channel' | 'program' | 'name' | 'fallback'
}

export interface Score {
  title: string
  /** Sorted by startBeat. */
  notes: ScoreNote[]
  tempoMap: TempoMark[]
  meters: MeterMark[]
  tracks: ScoreTrack[]
  /** End of the last note, in beats. */
  totalBeats: number
  /** The first tempo: the speed the music should have when the conductor follows it exactly. */
  referenceBpm: number
  /** Beats (quarter notes) per bar of the first meter. */
  beatsPerBar: number
}

/** Tempo of the score at a beat, from its tempo map (the composer's own ritardandi etc.). */
export function mapBpmAt(score: Score, beat: number): number {
  let bpm = score.tempoMap[0]?.bpm ?? 120
  for (const m of score.tempoMap) {
    if (m.beat <= beat) bpm = m.bpm
    else break
  }
  return bpm
}

/** Composer tempo relative to the reference tempo (1 = as written at the start). */
export function tempoRatioAt(score: Score, beat: number): number {
  return mapBpmAt(score, beat) / score.referenceBpm
}

export function sectionsUsed(score: Score): SectionId[] {
  return [...new Set(score.notes.map((n) => n.section))]
}

/** Duration in seconds if played exactly as written (reference tempo, composer's tempo map). */
export function nominalDurationSec(score: Score): number {
  let sec = 0
  const marks = score.tempoMap.length ? score.tempoMap : [{ beat: 0, bpm: score.referenceBpm }]
  for (let i = 0; i < marks.length; i++) {
    const from = marks[i].beat
    const to = i + 1 < marks.length ? Math.min(marks[i + 1].beat, score.totalBeats) : score.totalBeats
    if (to > from) sec += ((to - from) * 60) / marks[i].bpm
  }
  return sec
}

/** "bar.beat" (1-based) for a position in beats. */
export function barAndBeat(score: Score, positionBeats: number): { bar: number; beat: number } {
  const per = score.beatsPerBar
  const b = Math.max(0, positionBeats)
  return { bar: Math.floor(b / per) + 1, beat: Math.floor(b % per) + 1 }
}
