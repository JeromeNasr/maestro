import { INSTRUMENTS, instrumentForNote, instrumentForTrack, kitInstrument, type TrackInfo } from './instruments'

const t = (o: Partial<TrackInfo>): TrackInfo => ({ name: '', program: null, section: 'strings', medianMidi: 60, ...o })

describe('instrument assignment', () => {
  it('uses the track name first, for the string desks', () => {
    expect(instrumentForTrack(t({ name: 'Violins I', program: 48 }))).toBe('violins')
    expect(instrumentForTrack(t({ name: 'Violin II', program: 48 }))).toBe('violins2')
    expect(instrumentForTrack(t({ name: 'Violins 2' }))).toBe('violins2')
    expect(instrumentForTrack(t({ name: 'Violas' }))).toBe('violas')
    expect(instrumentForTrack(t({ name: 'Violoncello' }))).toBe('cellos')
    expect(instrumentForTrack(t({ name: 'Contrabass' }))).toBe('basses')
  })
  it('falls back to the GM program, then the register', () => {
    expect(instrumentForTrack(t({ program: 41 }))).toBe('violas')
    expect(instrumentForTrack(t({ program: 42 }))).toBe('cellos')
    expect(instrumentForTrack(t({ program: 48, medianMidi: 72 }))).toBe('violins')
    expect(instrumentForTrack(t({ program: 48, medianMidi: 45 }))).toBe('cellos')
    expect(instrumentForTrack(t({ program: 48, medianMidi: 33 }))).toBe('basses')
  })
  it('woodwinds', () => {
    const w = (name: string, program: number | null = null, medianMidi = 70) => instrumentForTrack(t({ name, program, section: 'woodwinds', medianMidi }))
    expect(w('Flute')).toBe('flutes')
    expect(w('', 68)).toBe('oboes')
    expect(w('Clarinet in Bb')).toBe('clarinets')
    expect(w('Fagott')).toBe('bassoons')
    expect(w('Winds', null, 80)).toBe('flutes')
    expect(w('Winds', null, 45)).toBe('bassoons')
  })
  it('brass', () => {
    const b = (name: string, program: number | null = null, medianMidi = 60) => instrumentForTrack(t({ name, program, section: 'brass', medianMidi }))
    expect(b('Horns')).toBe('horns')
    expect(b('Trumpets')).toBe('trumpets')
    expect(b('', 57)).toBe('trombones')
    expect(b('Tuba')).toBe('tuba')
    expect(b('Brass', 61, 70)).toBe('trumpets')
  })
  it('combined desks are assigned note by note, by register', () => {
    expect(instrumentForTrack(t({ name: 'Cellos & Basses' }))).toBe('register')
    expect(instrumentForNote('strings', 36, false)).toBe('basses')
    expect(instrumentForNote('strings', 48, false)).toBe('cellos')
  })
  it('General MIDI drum notes go to the right percussion instrument', () => {
    expect(kitInstrument(36)).toBe('bassDrum')
    expect(kitInstrument(38)).toBe('snareDrum')
    expect(kitInstrument(49)).toBe('cymbals')
    expect(kitInstrument(81)).toBe('triangle')
    expect(instrumentForTrack(t({ name: 'Percussion', section: 'percussion', kit: true }))).toBe('register')
    expect(instrumentForTrack(t({ name: 'Timpani', section: 'percussion', program: 47 }))).toBe('timpani')
  })
  it('every instrument belongs to exactly one of the four families and has a stage position', () => {
    expect(new Set(INSTRUMENTS.map((i) => i.id)).size).toBe(INSTRUMENTS.length)
    for (const i of INSTRUMENTS) {
      expect(['strings', 'woodwinds', 'brass', 'percussion']).toContain(i.section)
      expect(Math.abs(i.pan)).toBeLessThanOrEqual(1)
    }
  })
})
