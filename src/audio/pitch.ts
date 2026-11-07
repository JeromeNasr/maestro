/** Equal temperament, A4 = 440 Hz. A note's pitch depends on its MIDI number only — never on tempo. */
export const midiToHz = (midi: number, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12)

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const midiName = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
