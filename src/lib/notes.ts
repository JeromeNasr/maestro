/**
 * Note names in solfège (fixed do): Do Re Mi Fa Sol La Si. Octave numbers follow the usual convention in which middle C is
 * 60 = Do4 and the orchestra's tuning note A440 is La4 (MIDI 69). Black keys are written with a sharp (♯) going up and a flat
 * (♭) going down, so the same key can be named for the direction it is reached from.
 */
export const SOLFEGE_SHARP = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'] as const
export const SOLFEGE_FLAT = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'] as const

/** "La4" for MIDI 69. `flats` chooses Mi♭ over Re♯ (the better spelling in the flat keys). */
export function noteName(midi: number, opts: { octave?: boolean; flats?: boolean } = {}): string {
  const m = Math.round(midi)
  const name = (opts.flats ? SOLFEGE_FLAT : SOLFEGE_SHARP)[((m % 12) + 12) % 12]
  return opts.octave === false ? name : `${name}${Math.floor(m / 12) - 1}`
}

/** The eight white keys of a major scale from a starting MIDI note, for the little do-re-mi keyboard. */
export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11, 12] as const
export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12)
