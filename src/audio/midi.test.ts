import { readFileSync } from 'node:fs'
import midiPkg from '@tonejs/midi'
import { MidiParseError, parseMidi } from './midi'
import { barAndBeat, mapBpmAt, nominalDurationSec, sectionsUsed, tempoRatioAt } from './score'

const { Midi } = midiPkg
const file = (name: string) => new Uint8Array(readFileSync(`public/midi/${name}`))
const manifest = JSON.parse(readFileSync('public/midi/manifest.json', 'utf8')) as { id: string; file: string; bars: number; meter: number; bpm: number; notes: number; durationSec: number }[]

describe('parseMidi — the original compositions (real files)', () => {
  it.each(manifest)('$id: structure, meter, tempo and duration match the manifest', (m) => {
    const s = parseMidi(file(m.file))
    expect(s.notes).toHaveLength(m.notes)
    expect(s.beatsPerBar).toBe(m.meter)
    expect(s.meters[0]).toMatchObject({ beat: 0, numerator: m.meter, denominator: 4 })
    expect(s.referenceBpm).toBeCloseTo(m.bpm, 1)
    expect(nominalDurationSec(s)).toBeGreaterThan(m.durationSec - 3)
    expect(nominalDurationSec(s)).toBeLessThan(m.durationSec + 8) // the last notes ring a little past the final bar line
    expect(s.totalBeats / m.meter).toBeGreaterThanOrEqual(m.bars)
  })

  it.each(manifest)('$id: notes are sorted, in range, with usable velocities', (m) => {
    const s = parseMidi(file(m.file))
    for (let i = 1; i < s.notes.length; i++) expect(s.notes[i].startBeat).toBeGreaterThanOrEqual(s.notes[i - 1].startBeat)
    for (const n of s.notes) {
      expect(n.midi).toBeGreaterThanOrEqual(21)
      expect(n.midi).toBeLessThanOrEqual(108)
      expect(n.velocity).toBeGreaterThan(0)
      expect(n.velocity).toBeLessThanOrEqual(1)
      expect(n.durationBeats).toBeGreaterThan(0)
    }
  })

  it('every composition uses all four orchestra sections, mapped from the instruments', () => {
    for (const m of manifest) expect(sectionsUsed(parseMidi(file(m.file))).sort()).toEqual(['brass', 'percussion', 'strings', 'woodwinds'])
    const s = parseMidi(file('aurora-etude.mid'))
    const by = Object.fromEntries(s.tracks.map((t) => [t.name, t]))
    expect(by['Violins I']).toMatchObject({ section: 'strings', program: 40, mappedBy: 'program' })
    expect(by['Violas'].section).toBe('strings')
    expect(by['Cellos & Basses'].section).toBe('strings')
    expect(by['Flute'].section).toBe('woodwinds')
    expect(by['Oboe'].section).toBe('woodwinds')
    expect(by['Clarinet'].section).toBe('woodwinds')
    expect(by['Horns'].section).toBe('brass')
    expect(by['Trumpets'].section).toBe('brass')
    expect(by['Timpani']).toMatchObject({ section: 'percussion', program: 47 })
    expect(by['Percussion']).toMatchObject({ section: 'percussion', mappedBy: 'drum-channel', program: null })
  })

  it('drum-channel notes are flagged as kit notes; pitched timpani are not', () => {
    const s = parseMidi(file('parade-march.mid'))
    const drums = s.notes.filter((n) => s.tracks[n.trackId].name === 'Percussion')
    const timp = s.notes.filter((n) => s.tracks[n.trackId].name === 'Timpani')
    expect(drums.length).toBeGreaterThan(50)
    expect(drums.every((n) => n.kit === true)).toBe(true)
    expect(timp.every((n) => !n.kit)).toBe(true)
    expect(new Set(drums.map((n) => n.midi))).toEqual(new Set([36, 38, 49]))
  })

  it('carries the composer\'s ritardando in the tempo map', () => {
    const s = parseMidi(file('aurora-etude.mid'))
    expect(s.tempoMap.length).toBeGreaterThan(10)
    expect(mapBpmAt(s, 0)).toBeCloseTo(84, 1)
    expect(mapBpmAt(s, s.totalBeats - 1)).toBeLessThan(75)
    expect(tempoRatioAt(s, 0)).toBeCloseTo(1)
    expect(tempoRatioAt(s, s.totalBeats - 1)).toBeLessThan(0.9)
    // monotonically slowing at the end
    const tail = s.tempoMap.slice(1).map((t) => t.bpm)
    for (let i = 1; i < tail.length; i++) expect(tail[i]).toBeLessThanOrEqual(tail[i - 1])
  })

  it('has real musical content: dynamic contrast and a multi-minute duration (Aurora)', () => {
    const s = parseMidi(file('aurora-etude.mid'))
    const avg = (from: number, to: number) => {
      const xs = s.notes.filter((n) => n.startBeat >= from * 4 && n.startBeat < to * 4).map((n) => n.velocity)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    expect(avg(32, 48)).toBeGreaterThan(avg(0, 8) * 1.7) // tutti climax vs hushed opening
    expect(nominalDurationSec(s)).toBeGreaterThan(170)
  })

  it('positions convert to bar and beat', () => {
    const s = parseMidi(file('evening-minuet.mid'))
    expect(barAndBeat(s, 0)).toEqual({ bar: 1, beat: 1 })
    expect(barAndBeat(s, 4)).toEqual({ bar: 2, beat: 2 })
    expect(barAndBeat(s, 9)).toEqual({ bar: 4, beat: 1 })
  })
})

describe('parseMidi — general MIDI handling', () => {
  const build = (setup: (m: InstanceType<typeof Midi>) => void) => {
    const m = new Midi()
    setup(m)
    return new Uint8Array(m.toArray())
  }

  it('maps arbitrary General MIDI programs to sections', () => {
    const data = build((m) => {
      for (const [name, program] of [['a', 41], ['b', 57], ['c', 71], ['d', 47], ['e', 0], ['f', 24], ['g', 11], ['h', 61]] as const) {
        const t = m.addTrack()
        t.name = name
        t.instrument.number = program
        t.addNote({ midi: 60, ticks: 0, durationTicks: 480 })
      }
    })
    const s = parseMidi(data)
    const sec = Object.fromEntries(s.tracks.map((t) => [t.name, t.section]))
    expect(sec).toEqual({ a: 'strings', b: 'brass', c: 'woodwinds', d: 'percussion', e: 'strings', f: 'strings', g: 'percussion', h: 'brass' })
  })

  it('uses track names when the program is the unset default (piano)', () => {
    const data = build((m) => {
      for (const name of ['Solo Flute', 'French Horn', 'Snare Drum', 'Violin']) {
        const t = m.addTrack()
        t.name = name
        t.addNote({ midi: 60, ticks: 0, durationTicks: 480 })
      }
    })
    const s = parseMidi(data)
    expect(s.tracks.map((t) => [t.section, t.mappedBy])).toEqual([['woodwinds', 'name'], ['brass', 'name'], ['percussion', 'name'], ['strings', 'name']])
  })

  it('applies explicit overrides first, by track name or index', () => {
    const data = build((m) => {
      const a = m.addTrack(); a.name = 'Violin'; a.instrument.number = 40; a.addNote({ midi: 60, ticks: 0, durationTicks: 480 })
      const b = m.addTrack(); b.name = 'Mystery'; b.instrument.number = 40; b.addNote({ midi: 62, ticks: 0, durationTicks: 480 })
    })
    const s = parseMidi(data, { overrides: { Violin: 'woodwinds', '1': 'brass' } })
    expect(s.tracks.map((t) => [t.section, t.mappedBy])).toEqual([['woodwinds', 'override'], ['brass', 'override']])
  })

  it('falls back to strings for unknown programs and skips empty tracks', () => {
    const data = build((m) => {
      m.addTrack() // empty
      const t = m.addTrack(); t.name = 'X'; t.instrument.number = 100; t.addNote({ midi: 60, ticks: 0, durationTicks: 480 })
    })
    const s = parseMidi(data)
    expect(s.tracks).toHaveLength(1)
    expect(s.tracks[0]).toMatchObject({ section: 'strings', mappedBy: 'fallback' })
  })

  it('defaults to 120 BPM and 4/4 when the file states neither, and converts ticks to beats', () => {
    const data = build((m) => {
      m.header.tempos.length = 0
      m.header.timeSignatures.length = 0
      const t = m.addTrack(); t.addNote({ midi: 60, ticks: 960, durationTicks: 240 })
    })
    const s = parseMidi(data)
    expect(s.referenceBpm).toBe(120)
    expect(s.beatsPerBar).toBe(4)
    expect(s.notes[0]).toMatchObject({ startBeat: 2, durationBeats: 0.5 })
    expect(s.totalBeats).toBe(2.5)
  })

  it('treats 6/8 as three quarter-note... i.e. 3 beats per bar of quarter-note counting', () => {
    const data = build((m) => {
      m.header.timeSignatures.push({ ticks: 0, timeSignature: [6, 8], measures: 0 })
      const t = m.addTrack(); t.addNote({ midi: 60, ticks: 0, durationTicks: 480 })
    })
    expect(parseMidi(data).beatsPerBar).toBe(3)
  })

  it('rejects garbage and note-less files with a clear error', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4]))).toThrow(MidiParseError)
    expect(() => parseMidi(new Uint8Array(0))).toThrow(MidiParseError)
    expect(() => parseMidi(new Uint8Array(new Midi().toArray()))).toThrow(/no notes/i)
  })

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const u8 = file('evening-minuet.mid')
    expect(parseMidi(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer).notes.length).toBeGreaterThan(100)
  })
})
