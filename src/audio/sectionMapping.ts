import type { SectionId } from '@/orchestra/sections'
import type { ScoreTrack } from './score'

/**
 * Maps MIDI tracks to the four orchestra sections.
 *
 * Priority:  explicit override  >  General MIDI drum channel (10)  >  GM program  >  track-name hint  >  fallback.
 *
 * GM program → section (documented design decision):
 *   strings     40–46 (violin, viola, cello, contrabass, tremolo, pizzicato, harp), 48–55 (string/synth-string
 *               ensembles, choir & voice — sustained "bowed-like" colour), 24–39 guitars/basses and 0–7 pianos /
 *               harpsichord (continuo/bass instruments with no section of their own are given to the strings),
 *               8–15 chromatic percussion go to percussion (below)
 *   brass       56–63
 *   woodwinds   64–79 (saxes, oboe, english horn, bassoon, clarinet, piccolo, flute, recorder, pan flute…), 16–23
 *               organs / accordion (reed-like)
 *   percussion  47 timpani, 8–15 chromatic percussion (celesta, glockenspiel, vibraphone, marimba, xylophone,
 *               tubular bells…), 112–119 percussive instruments
 *   anything else → strings (fallback)
 */
export function sectionForProgram(program: number): SectionId | null {
  if (program === 47) return 'percussion'
  if (program >= 8 && program <= 15) return 'percussion'
  if (program >= 112 && program <= 119) return 'percussion'
  if ((program >= 40 && program <= 46) || (program >= 48 && program <= 55)) return 'strings'
  if (program >= 56 && program <= 63) return 'brass'
  if (program >= 64 && program <= 79) return 'woodwinds'
  if (program >= 16 && program <= 23) return 'woodwinds'
  if (program >= 0 && program <= 7) return 'strings'
  if (program >= 24 && program <= 39) return 'strings'
  return null
}

const NAME_HINTS: [RegExp, SectionId][] = [
  [/timp|drum|perc|cymbal|snare|triangle|glock|xylo|marimba|bell/i, 'percussion'],
  [/trumpet|trombone|tuba|horn|cornet|brass|bugle/i, 'brass'],
  [/flute|piccolo|oboe|clarinet|bassoon|recorder|sax|wind|reed|fife/i, 'woodwinds'],
  [/violin|viola|cello|bass|string|harp|continuo|harpsichord|lute|guitar/i, 'strings'],
]

export function sectionForName(name: string): SectionId | null {
  for (const [re, section] of NAME_HINTS) if (re.test(name)) return section
  return null
}

export interface MappingInput {
  name: string
  program: number | null
  channel: number
  /** True when the file marks the track as percussion (channel 10). */
  percussion: boolean
}

/** `overrides` maps a track NAME or numeric index to a section, for arrangements whose programs are wrong. */
export function mapTrack(t: MappingInput, index: number, overrides: Record<string, SectionId> = {}): { section: SectionId; mappedBy: ScoreTrack['mappedBy'] } {
  const ov = overrides[t.name] ?? overrides[String(index)]
  if (ov) return { section: ov, mappedBy: 'override' }
  if (t.percussion || t.channel === 9) return { section: 'percussion', mappedBy: 'drum-channel' }
  // Program 0 is the General MIDI default (piano), usually "unset" in arrangements: trust a descriptive name first.
  if (t.program === null || t.program === 0) {
    const byName = sectionForName(t.name)
    if (byName) return { section: byName, mappedBy: 'name' }
  }
  if (t.program !== null) {
    const byProgram = sectionForProgram(t.program)
    if (byProgram) return { section: byProgram, mappedBy: 'program' }
  }
  const byName = sectionForName(t.name)
  if (byName) return { section: byName, mappedBy: 'name' }
  return { section: 'strings', mappedBy: 'fallback' }
}
