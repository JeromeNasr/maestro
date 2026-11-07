import { Midi } from '@tonejs/midi'
import type { SectionId } from '@/orchestra/sections'
import { mapTrack } from './sectionMapping'
import type { MeterMark, Score, ScoreNote, ScoreTrack, TempoMark } from './score'

export class MidiParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MidiParseError'
  }
}

export interface ParseOptions {
  /** Section overrides by track name or index (see sectionMapping.ts). */
  overrides?: Record<string, SectionId>
  title?: string
}

const MIN_DURATION_BEATS = 1 / 16

/**
 * Parses a Standard MIDI File into a tempo-independent Score: notes in beats, tempo map, time signatures, and each
 * track assigned to one of the four orchestra sections. Pure (no audio, no DOM).
 */
export function parseMidi(data: ArrayBuffer | Uint8Array, opts: ParseOptions = {}): Score {
  let midi: Midi
  try {
    midi = new Midi(data instanceof Uint8Array ? data : new Uint8Array(data))
  } catch (e) {
    throw new MidiParseError(`Not a valid MIDI file: ${(e as Error).message}`)
  }
  const ppq = midi.header.ppq
  if (!ppq || ppq <= 0) throw new MidiParseError('MIDI file has no valid timing resolution')

  const tracks: ScoreTrack[] = []
  const notes: ScoreNote[] = []
  midi.tracks.forEach((t, index) => {
    if (t.notes.length === 0) return
    const percussion = t.instrument.percussion || t.channel === 9
    const program = percussion ? null : t.instrument.number
    const { section, mappedBy } = mapTrack({ name: t.name || t.instrument.name || '', program, channel: t.channel, percussion }, index, opts.overrides)
    const id = tracks.length
    tracks.push({ id, name: t.name || t.instrument.name || `Track ${index + 1}`, program, channel: t.channel, section, noteCount: t.notes.length, mappedBy })
    for (const n of t.notes) {
      notes.push({
        section,
        midi: n.midi,
        startBeat: n.ticks / ppq,
        durationBeats: Math.max(MIN_DURATION_BEATS, n.durationTicks / ppq),
        velocity: Math.min(1, Math.max(0.05, n.velocity)),
        trackId: id,
        ...(percussion ? { kit: true } : {}),
      })
    }
  })
  if (notes.length === 0) throw new MidiParseError('MIDI file contains no notes')
  notes.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi)

  const tempoMap: TempoMark[] = midi.header.tempos.map((t) => ({ beat: t.ticks / ppq, bpm: t.bpm })).sort((a, b) => a.beat - b.beat)
  if (tempoMap.length === 0 || tempoMap[0].beat > 0) tempoMap.unshift({ beat: 0, bpm: 120 }) // the MIDI default
  const meters: MeterMark[] = midi.header.timeSignatures
    .map((m) => ({ beat: m.ticks / ppq, numerator: m.timeSignature[0], denominator: m.timeSignature[1] }))
    .sort((a, b) => a.beat - b.beat)
  if (meters.length === 0 || meters[0].beat > 0) meters.unshift({ beat: 0, numerator: 4, denominator: 4 })

  const totalBeats = Math.max(...notes.map((n) => n.startBeat + n.durationBeats))
  const first = meters[0]
  return {
    title: opts.title ?? (midi.name || 'Untitled'),
    notes, tempoMap, meters, tracks, totalBeats,
    referenceBpm: tempoMap[0].bpm,
    beatsPerBar: (first.numerator * 4) / first.denominator,
  }
}
