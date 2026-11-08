import type { SectionId } from '@/orchestra/sections'

/**
 * The individual orchestral instruments (the "desks" of the orchestra). The mixer, the gesture dynamics and the UI still
 * work with the four FAMILIES (SectionId) so the conducting model stays simple; instruments exist so that each MIDI
 * track is played by the right sounding body (violas sound like violas, not like "strings") and positioned on the stage.
 */
export const INSTRUMENTS = [
  { id: 'violins', section: 'strings', label: 'Violins I', pan: -0.6 },
  { id: 'violins2', section: 'strings', label: 'Violins II', pan: -0.28 },
  { id: 'violas', section: 'strings', label: 'Violas', pan: 0.22 },
  { id: 'cellos', section: 'strings', label: 'Cellos', pan: 0.5 },
  { id: 'basses', section: 'strings', label: 'Double basses', pan: 0.78 },
  { id: 'flutes', section: 'woodwinds', label: 'Flutes', pan: -0.18 },
  { id: 'oboes', section: 'woodwinds', label: 'Oboes', pan: 0.05 },
  { id: 'clarinets', section: 'woodwinds', label: 'Clarinets', pan: 0.2 },
  { id: 'bassoons', section: 'woodwinds', label: 'Bassoons', pan: 0.36 },
  { id: 'horns', section: 'brass', label: 'French horns', pan: 0.55 },
  { id: 'trumpets', section: 'brass', label: 'Trumpets', pan: -0.1 },
  { id: 'trombones', section: 'brass', label: 'Trombones', pan: 0.28 },
  { id: 'tuba', section: 'brass', label: 'Tuba', pan: 0.45 },
  { id: 'timpani', section: 'percussion', label: 'Timpani', pan: -0.05 },
  { id: 'bassDrum', section: 'percussion', label: 'Bass drum', pan: 0.05 },
  { id: 'snareDrum', section: 'percussion', label: 'Snare drum', pan: -0.3 },
  { id: 'cymbals', section: 'percussion', label: 'Cymbals', pan: 0.3 },
  { id: 'triangle', section: 'percussion', label: 'Triangle', pan: 0.15 },
] as const satisfies readonly { id: string; section: SectionId; label: string; pan: number }[]

export type InstrumentId = (typeof INSTRUMENTS)[number]['id']
export const INSTRUMENT_IDS = INSTRUMENTS.map((i) => i.id) as InstrumentId[]
export const instrumentInfo = (id: InstrumentId) => INSTRUMENTS.find((i) => i.id === id)!
export const instrumentLabel = (id: InstrumentId) => instrumentInfo(id).label

/** Sample sets share between instruments: Violins II are played with the violin recordings (see LICENSES.md). */
export const SAMPLE_SET_OF: Partial<Record<InstrumentId, InstrumentId>> = { violins2: 'violins' }

/** Fallback instrument for a family (used for notes whose track gives no better information). */
export const DEFAULT_INSTRUMENT: Record<SectionId, InstrumentId> = { strings: 'violins', woodwinds: 'oboes', brass: 'horns', percussion: 'timpani' }

export interface TrackInfo {
  name: string
  program: number | null
  section: SectionId
  /** Median MIDI pitch of the track's notes (sounding pitch). */
  medianMidi: number
  /** The track holds drum-kit notes (General MIDI channel 10). */
  kit?: boolean
}

/** General MIDI drum-kit note → percussion instrument. */
export function kitInstrument(midi: number): InstrumentId {
  if (midi === 35 || midi === 36 || midi === 41 || midi === 43 || midi === 45) return 'bassDrum'
  if (midi === 37 || midi === 38 || midi === 39 || midi === 40) return 'snareDrum'
  if (midi === 49 || midi === 51 || midi === 52 || midi === 53 || midi === 55 || midi === 57 || midi === 59) return 'cymbals'
  return 'triangle'
}

const byRegister = {
  strings: (m: number): InstrumentId => (m >= 64 ? 'violins' : m >= 53 ? 'violas' : m >= 40 ? 'cellos' : 'basses'),
  woodwinds: (m: number): InstrumentId => (m >= 74 ? 'flutes' : m >= 62 ? 'oboes' : m >= 50 ? 'clarinets' : 'bassoons'),
  brass: (m: number): InstrumentId => (m >= 66 ? 'trumpets' : m >= 50 ? 'horns' : m >= 41 ? 'trombones' : 'tuba'),
  percussion: (): InstrumentId => 'timpani',
}

/**
 * Track → instrument(s). Returns either one instrument for the whole track, or 'register' when the track doubles several
 * desks (e.g. "Cellos & Basses") and each note should be assigned by its pitch.
 * Priority: GM program (specific instruments) > descriptive track name > register of the notes.
 */
export function instrumentForTrack(t: TrackInfo): InstrumentId | 'register' {
  if (t.kit) return 'register'
  const name = t.name.toLowerCase()
  const p = t.program
  // Combined desks ("Cellos & Basses", "Cellos/Basses"): assign note by note.
  if (/(cello|violoncell).*(bass)|(bass).*(cello)/.test(name)) return 'register'
  switch (t.section) {
    case 'strings':
      if (/violin/.test(name)) return /(\bii\b|\b2\b|second|2nd)/.test(name) ? 'violins2' : 'violins'
      if (/viola/.test(name)) return 'violas'
      if (/cello|violoncell/.test(name)) return 'cellos'
      if (/contrabass|double bass|basses|\bbass\b/.test(name)) return 'basses'
      if (p === 40) return 'violins'
      if (p === 41) return 'violas'
      if (p === 42) return 'cellos'
      if (p === 43) return 'basses'
      return byRegister.strings(t.medianMidi)
    case 'woodwinds':
      if (/flute|piccolo|fife|recorder/.test(name) || p === 72 || p === 73 || p === 74 || p === 75) return 'flutes'
      if (/oboe|english horn|cor anglais/.test(name) || p === 68 || p === 69) return 'oboes'
      if (/clarinet/.test(name) || p === 71) return 'clarinets'
      if (/bassoon|fagott/.test(name) || p === 70) return 'bassoons'
      return byRegister.woodwinds(t.medianMidi)
    case 'brass':
      if (/trumpet|cornet|bugle/.test(name) || p === 56 || p === 59) return 'trumpets'
      if (/trombone/.test(name) || p === 57) return 'trombones'
      if (/tuba/.test(name) || p === 58) return 'tuba'
      if (/horn/.test(name) || p === 60) return 'horns'
      return byRegister.brass(t.medianMidi)
    case 'percussion':
      if (/timp|kettle/.test(name) || p === 47) return 'timpani'
      return 'timpani'
  }
}

/** Instrument for one note of a track whose instrument is 'register'. */
export function instrumentForNote(section: SectionId, midi: number, kit: boolean | undefined): InstrumentId {
  if (kit) return kitInstrument(midi)
  return byRegister[section](midi)
}

export const instrumentsOfSection = (section: SectionId): InstrumentId[] => INSTRUMENTS.filter((i) => i.section === section).map((i) => i.id)
