import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { instrumentsUsed, nominalDurationSec, type Score } from '@/audio/score'
import { parseMidi } from '@/audio/midi'
import { Sequencer, type ScheduledNote } from '@/audio/sequencer'
import { getComposition } from './compositions'
import { COMPOSITIONS } from './compositions'

const dir = join(process.cwd(), 'public/midi')
const load = (id: string): Score => {
  const bytes = readFileSync(join(dir, `${id}.mid`))
  return parseMidi(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), { title: id })
}
const provenance = JSON.parse(readFileSync(join(dir, 'classics.json'), 'utf8')) as { pieces: { id: string; durationSec: number; notes: number; referenceBpm: number; mutopia: { license: string; commit: string; maintainer: string } }[] }
const CLASSICS = ['beethoven-symphony-5-i', 'mozart-nachtmusik-i', 'mozart-nachtmusik-ii', 'vivaldi-spring-i', 'bach-brandenburg-1-i']
const first = (s: Score, track: string, n: number) => s.notes.filter((x) => s.tracks[x.trackId].name === track).slice(0, n).map((x) => x.midi)

describe('classical repertoire (rendered from Mutopia LilyPond sources)', () => {
  it.each(CLASSICS)('%s parses, is registered with a matching duration, and traces to a pinned source commit', (id) => {
    const score = load(id)
    const comp = getComposition(id)!
    const rec = provenance.pieces.find((p) => p.id === id)!
    expect(rec, 'provenance entry').toBeDefined()
    expect(rec.mutopia.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(rec.mutopia.license).toBeTruthy()
    // The licence text recorded in the registry names the licence found in the source header.
    expect(comp.midiLicense!.license.toLowerCase()).toContain(rec.mutopia.license.toLowerCase().replace(/ \(.*\)/, ''))
    expect(comp.midiLicense!.source).toContain(rec.mutopia.commit.slice(0, 7))
    expect(score.notes.length).toBe(rec.notes)
    expect(Math.abs(nominalDurationSec(score) - comp.durationSec)).toBeLessThan(1.5)
    expect(score.referenceBpm).toBeCloseTo(rec.referenceBpm, 1)
    expect(`${score.beatsPerBar}`).toBeTruthy()
  })

  it('every track of every classic is a real instrument of the right family, never the fallback', () => {
    for (const id of CLASSICS) {
      const score = load(id)
      for (const t of score.tracks) {
        expect(t.mappedBy, `${id}/${t.name}`).not.toBe('fallback')
        expect(t.instruments?.length, `${id}/${t.name}`).toBeGreaterThan(0)
      }
      expect(instrumentsUsed(score).length).toBeGreaterThanOrEqual(5)
    }
  })

  it('Beethoven 5: the famous opening — G G G E♭ then F F F D — in strings and clarinets, sounding together', () => {
    const s = load('beethoven-symphony-5-i')
    for (const part of ['Violins I', 'Violins II', 'Clarinets']) expect(first(s, part, 8), part).toEqual([67, 67, 67, 63, 65, 65, 65, 62])
    expect(first(s, 'Violas', 4)).toEqual([55, 55, 55, 51])
    // after a half-beat rest: the motif begins on the off-beat of beat 1
    expect(s.notes.filter((n) => s.tracks[n.trackId].name === 'Violins I')[0].startBeat).toBeCloseTo(0.5, 5)
    expect(new Set(s.notes.map((n) => n.instrument))).toEqual(new Set(['flutes', 'oboes', 'clarinets', 'bassoons', 'horns', 'trumpets', 'timpani', 'violins', 'violins2', 'violas', 'cellos', 'basses']))
    expect(s.beatsPerBar).toBe(2)
  })

  it('double basses sound an octave below the violas where they double (written-pitch convention)', () => {
    const s = load('beethoven-symphony-5-i')
    expect(first(s, 'Double basses', 4)).toEqual([43, 43, 43, 39])
  })

  it('Mozart K.525: the opening G–D–G–D–G… figure in the violas, cellos (and basses an octave lower)', () => {
    const s = load('mozart-nachtmusik-i')
    expect(first(s, 'Violas', 8)).toEqual([67, 62, 67, 62, 67, 62, 67, 71])
    expect(first(s, 'Cellos', 3)).toEqual([55, 50, 55])
    expect(first(s, 'Double basses', 3)).toEqual([43, 38, 43])
    expect(new Set(s.notes.map((n) => n.instrument))).toEqual(new Set(['violins', 'violins2', 'violas', 'cellos', 'basses']))
  })

  it('Vivaldi Spring: the E-major theme (E G♯ G♯ G♯ F♯ E) in the solo violin and Violins I', () => {
    const s = load('vivaldi-spring-i')
    expect(first(s, 'Violins I', 6)).toEqual([76, 80, 80, 80, 78, 76])
    expect(first(s, 'Violin solo', 6)).toEqual([76, 80, 80, 80, 78, 76])
  })

  it('Brandenburg 1: the horn fanfare C–F–A–C and F–A–C–F, with oboes, bassoon and strings; no violino piccolo clash', () => {
    const s = load('bach-brandenburg-1-i')
    expect(first(s, 'Horns I', 4)).toEqual([60, 65, 69, 72])
    expect(first(s, 'Violins I', 4)).toEqual([65, 69, 72, 77])
    expect(s.tracks.some((t) => /piccolo/i.test(t.name))).toBe(false)
    expect(new Set(s.notes.map((n) => n.instrument))).toEqual(new Set(['horns', 'oboes', 'bassoons', 'violins', 'violins2', 'violas', 'cellos', 'basses']))
  })

  it('no piece plays pitches outside what its instrument can sound (a catch for transposition mistakes)', () => {
    const range: Record<string, [number, number]> = {
      violins: [55, 100], violins2: [55, 100], violas: [48, 90], cellos: [36, 81], basses: [24, 67], flutes: [60, 100], oboes: [58, 93],
      clarinets: [50, 94], bassoons: [34, 75], horns: [34, 84], trumpets: [52, 88], trombones: [34, 75], tuba: [24, 65], timpani: [36, 60],
    }
    for (const id of CLASSICS) {
      for (const n of load(id).notes) {
        const r = range[n.instrument!]
        expect(r, `${id} ${n.instrument}`).toBeDefined()
        expect(n.midi, `${id} ${n.instrument} ${n.midi}`).toBeGreaterThanOrEqual(r[0])
        expect(n.midi, `${id} ${n.instrument} ${n.midi}`).toBeLessThanOrEqual(r[1])
      }
    }
  })

  it('every shipped MIDI file is accounted for: originals via manifest.json, classics via classics.json', () => {
    const originals = (JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { id: string }[]).map((m) => m.id)
    const registered = COMPOSITIONS.filter((c) => c.status === 'available').map((c) => c.id)
    for (const id of registered) expect([...originals, ...provenance.pieces.map((p) => p.id)], id).toContain(id)
  })

  it('a real score follows the conductor: doubling the tempo halves the time between notes and never changes a pitch', () => {
    const score = load('beethoven-symphony-5-i')
    const play = (bpm: number) => {
      const seq = new Sequencer(score, undefined, bpm)
      seq.play(0)
      const out: ScheduledNote[] = []
      for (let t = 0; t < 14 && out.length < 60; t += 0.025) seq.tick(t, (n) => out.push(n))
      return out.slice(0, 40)
    }
    const slow = play(100)
    const fast = play(200)
    expect(fast.map((n) => n.midi)).toEqual(slow.map((n) => n.midi)) // pitch is the MIDI number only
    expect(fast.map((n) => n.instrument)).toEqual(slow.map((n) => n.instrument))
    expect(slow[0].instrument).toBeDefined()
    const span = (a: ScheduledNote[]) => a.at(-1)!.timeSec - a[0].timeSec
    expect(span(slow) / span(fast)).toBeGreaterThan(1.9)
    expect(span(slow) / span(fast)).toBeLessThan(2.1)
  })
})
