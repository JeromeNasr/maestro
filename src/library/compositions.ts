import type { Composition } from './types'

/**
 * Composition registry. Adding a piece = appending one entry (+ its MIDI file and licence record).
 * Rule: a piece may only be 'available' once its MIDI arrangement has a documented, verified licence.
 */
export const COMPOSITIONS: Composition[] = [
  {
    id: 'maestro-demo-001',
    title: 'Aurora Étude (Demonstration)',
    composer: 'MAESTRO Project (original)',
    period: 'Baroque',
    durationSec: 90,
    timeSignature: '4/4',
    difficulty: 'Beginner',
    description:
      'A short original piece written for this project in a Baroque idiom, so the conducting engine can be built and tested without third-party licensing. Steady four-beat pulse with clear dynamic contrast.',
    status: 'available',
    // The MIDI file itself is generated in Phase 4; until then the Studio reports playback as not implemented.
    midiUrl: '/midi/aurora-etude.mid',
    midiLicense: {
      license: 'CC0-1.0 (original work, to be released by the project owner)',
      source: 'Composed for MAESTRO; generated programmatically in Phase 4',
      notes: 'MIDI file does not exist yet (Phase 4).',
    },
    art: { hue: 'gold', motif: 'staff' },
  },
  {
    id: 'bach-brandenburg-3',
    title: 'Brandenburg Concerto No. 3',
    composer: 'Johann Sebastian Bach',
    period: 'Baroque',
    durationSec: 0,
    timeSignature: '4/4',
    difficulty: 'Intermediate',
    description: 'A vivid concerto for strings built on a driving, interlocking motif — an ideal piece for practising a steady four-beat pattern.',
    status: 'planned',
    pendingReason: 'Awaiting a verified public-domain or openly licensed MIDI arrangement.',
    art: { hue: 'bronze', motif: 'rings' },
  },
  {
    id: 'vivaldi-spring',
    title: 'The Four Seasons — Spring',
    composer: 'Antonio Vivaldi',
    period: 'Baroque',
    durationSec: 0,
    timeSignature: '4/4',
    difficulty: 'Intermediate',
    description: 'Bright birdsong, storms and pastoral calm. Rich in dynamic contrast, which makes it ideal for left-hand practice.',
    status: 'planned',
    pendingReason: 'Awaiting a verified public-domain or openly licensed MIDI arrangement.',
    art: { hue: 'ivory', motif: 'staff' },
  },
  {
    id: 'handel-water-music',
    title: 'Water Music',
    composer: 'George Frideric Handel',
    period: 'Baroque',
    durationSec: 0,
    timeSignature: '3/4',
    difficulty: 'Beginner',
    description: 'Stately, dance-like suites for the royal barge. A gentle introduction to conducting in three.',
    status: 'planned',
    pendingReason: 'Awaiting a verified public-domain or openly licensed MIDI arrangement.',
    art: { hue: 'bronze', motif: 'waves' },
  },
]

export const getComposition = (id: string) => COMPOSITIONS.find((c) => c.id === id)

/** Case-insensitive match across title, composer, period, time signature and difficulty. */
export function searchCompositions(query: string, list: Composition[] = COMPOSITIONS): Composition[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((c) =>
    [c.title, c.composer, c.period, c.timeSignature, c.difficulty].some((f) => f.toLowerCase().includes(q)),
  )
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
