import { MAJOR_STEPS, midiToHz, noteName } from './notes'

describe('solfège note names', () => {
  it('names the white keys Do Re Mi Fa Sol La Si, with the octave', () => {
    expect([60, 62, 64, 65, 67, 69, 71, 72].map((m) => noteName(m))).toEqual(['Do4', 'Re4', 'Mi4', 'Fa4', 'Sol4', 'La4', 'Si4', 'Do5'])
  })
  it('the tuning note A440 is La4 and the lowest piano key is La0', () => {
    expect(noteName(69)).toBe('La4')
    expect(noteName(21)).toBe('La0')
    expect(midiToHz(69)).toBe(440)
  })
  it('black keys are sharps, or flats when asked', () => {
    expect(noteName(61)).toBe('Do♯4')
    expect(noteName(61, { flats: true })).toBe('Re♭4')
    expect(noteName(70, { flats: true })).toBe('Si♭4')
  })
  it('can leave the octave off, and copes with low and fractional values', () => {
    expect(noteName(60, { octave: false })).toBe('Do')
    expect(noteName(12)).toBe('Do0')
    expect(noteName(11)).toBe('Si-1')
    expect(noteName(59.6)).toBe('Do4')
  })
  it('the major scale steps give do-re-mi from any starting key', () => {
    expect(MAJOR_STEPS.map((s) => noteName(67 + s, { octave: false }))).toEqual(['Sol', 'La', 'Si', 'Do', 'Re', 'Mi', 'Fa♯', 'Sol'])
  })
})
