// Turns a piece description (chords + figures + orchestration per section) into per-instrument note lists.
import { ladder, parseChord, parseFigure, rootAtOrAbove } from './theory.mjs'

export const PARTS = [
  { id: 'violin', name: 'Violins I', program: 40, channel: 0, lo: 66 },
  { id: 'viola', name: 'Violas', program: 41, channel: 1, lo: 57 },
  { id: 'cello', name: 'Cellos & Basses', program: 42, channel: 2, lo: 38 },
  { id: 'flute', name: 'Flute', program: 73, channel: 3, lo: 74 },
  { id: 'oboe', name: 'Oboe', program: 68, channel: 4, lo: 69 },
  { id: 'clarinet', name: 'Clarinet', program: 71, channel: 5, lo: 55 },
  { id: 'horn', name: 'Horns', program: 60, channel: 6, lo: 55 },
  { id: 'trumpet', name: 'Trumpets', program: 56, channel: 7, lo: 62 },
  { id: 'timpani', name: 'Timpani', program: 47, channel: 8, lo: 33 },
  { id: 'drums', name: 'Percussion', program: null, channel: 9, lo: 0 },
]

const clampVel = (v) => Math.max(0.05, Math.min(1, v))

/** Accompaniment patterns, by meter. Return events with beat offsets inside the bar. */
const PATTERNS = {
  pad: (chord, lo, n, idx = [0, 2]) => idx.map((i) => ({ beat: 0, dur: n - 0.05, midi: ladder(chord, rootAtOrAbove(chord, lo), i) })),
  arp: (chord, lo, n) => {
    const root = rootAtOrAbove(chord, lo)
    const seq = n === 4 ? [0, 1, 2, 1, 0, 1, 2, 1] : n === 3 ? [0, 1, 2, 1, 2, 1] : [0, 1, 2, 1]
    return seq.map((i, k) => ({ beat: k * 0.5, dur: 0.48, midi: ladder(chord, root, i) }))
  },
  oom: (chord, lo, n) => {
    const root = rootAtOrAbove(chord, lo)
    if (n === 3) return [1, 2].flatMap((b) => [1, 2].map((i) => ({ beat: b, dur: 0.85, midi: ladder(chord, root, i) })))
    if (n === 2) return [1].flatMap((b) => [0, 2].map((i) => ({ beat: b - 0.5, dur: 0.45, midi: ladder(chord, root, i) })))
    return [1, 3].flatMap((b) => [1, 2].map((i) => ({ beat: b, dur: 0.85, midi: ladder(chord, root, i) })))
  },
  bassHalf: (chord, lo, n) => {
    const root = rootAtOrAbove(chord, lo)
    if (n === 4) return [{ beat: 0, dur: 1.9, midi: root }, { beat: 2, dur: 1.9, midi: root + 7 }]
    if (n === 3) return [{ beat: 0, dur: 2.9, midi: root }]
    return [{ beat: 0, dur: 1.9, midi: root }]
  },
  bassWalk: (chord, lo, n) => {
    const root = rootAtOrAbove(chord, lo)
    const idx = n === 4 ? [0, 1, 2, 1] : n === 3 ? [0, 2, 1] : [0, 2]
    return idx.map((i, k) => ({ beat: k, dur: 0.92, midi: ladder(chord, root, i) }))
  },
  bassRoot: (chord, lo, n) => [{ beat: 0, dur: n - 0.1, midi: rootAtOrAbove(chord, lo) }],
  timpRoots: (chord, lo, n) => {
    const r = rootAtOrAbove(chord, lo)
    return n === 4 ? [{ beat: 0, dur: 1.5, midi: r }, { beat: 2, dur: 1.5, midi: r + 7 > 52 ? r : r + 7 }] : n === 3 ? [{ beat: 0, dur: 2, midi: r }] : [{ beat: 0, dur: 1, midi: r }, { beat: 1, dur: 1, midi: r }]
  },
  timpRoll: (chord, lo, n) => {
    const r = rootAtOrAbove(chord, lo)
    return Array.from({ length: n * 2 }, (_, k) => ({ beat: k * 0.5, dur: 0.45, midi: r, vel: k % 2 ? 0.8 : 1 }))
  },
  fanfare: (chord, lo, n) => {
    const root = rootAtOrAbove(chord, lo)
    const f = n === 4 ? [[0, 1.5, 0], [1.5, 0.5, 0], [2, 1, 2], [3, 1, 3]] : n === 3 ? [[0, 1, 0], [1, 2, 2]] : [[0, 1, 0], [1, 1, 2]]
    return f.map(([b, d, i]) => ({ beat: b, dur: d - 0.05, midi: ladder(chord, root, i) }))
  },
  afterbeat: (chord, lo, n) => {
    const root = rootAtOrAbove(chord, lo)
    return [0, 2].map((i) => ({ beat: 1, dur: 0.45, midi: ladder(chord, root, i) })).concat(n === 2 ? [] : [])
  },
}

const KIT = { kick: 36, snare: 38, crash: 49 }
const DRUM_PATTERNS = {
  march: (n) => (n === 2 ? [{ beat: 0, dur: 0.25, midi: KIT.kick }, { beat: 1, dur: 0.25, midi: KIT.snare }, { beat: 1.5, dur: 0.25, midi: KIT.snare, vel: 0.6 }] : [{ beat: 0, dur: 0.25, midi: KIT.kick }]),
  snareRoll: (n) => Array.from({ length: n * 2 }, (_, k) => ({ beat: k * 0.5, dur: 0.25, midi: KIT.snare, vel: k % 2 ? 0.55 : 0.8 })),
  pulse: (n) => [{ beat: 0, dur: 0.25, midi: KIT.kick }, ...(n > 2 ? [{ beat: n - 1, dur: 0.25, midi: KIT.snare, vel: 0.5 }] : [])],
}

function addBar(track, startBeat, events, vel, partGain = 1) {
  for (const e of events) track.push({ startBeat: startBeat + e.beat, duration: e.dur, midi: e.midi, velocity: clampVel((e.vel ?? 1) * vel * partGain) })
}

/**
 * piece = { meter: n, key: pitch class of tonic, sections: [{ name, chords:[…per bar], melody:[figure names per bar],
 *   vel:[from,to], parts:{ violin:'melody', flute:'melody8va', … }, crashAtStart, crashAtEnd }] , figures: {…} }
 * Returns { tracks: { partId: notes[] }, totalBars }
 */
export function compose(piece) {
  const n = piece.meter
  const tracks = Object.fromEntries(PARTS.map((p) => [p.id, []]))
  let bar = 0
  for (const sec of piece.sections) {
    const nb = sec.chords.length
    if (sec.melody.length !== nb) throw new Error(`${piece.title}/${sec.name}: ${nb} chords but ${sec.melody.length} melody figures`)
    for (let i = 0; i < nb; i++, bar++) {
      const chord = parseChord(sec.chords[i])
      const start = bar * n
      const u = nb > 1 ? i / (nb - 1) : 0
      const vel = sec.vel[0] + (sec.vel[1] - sec.vel[0]) * u
      const fig = sec.melody[i]
      const figText = piece.figures[fig]
      if (!figText) throw new Error(`Unknown figure "${fig}" in ${sec.name}`)
      const lo = (id) => PARTS.find((p) => p.id === id).lo
      const melody = (id, shift = 0) => parseFigure(figText, chord, lo(id) + shift, piece.key, n)
      for (const [id, role] of Object.entries(sec.parts)) {
        const t = tracks[id]
        if (role === 'melody') addBar(t, start, melody(id), vel, 1)
        else if (role === 'melody8va') addBar(t, start, melody(id), vel, 0.85)
        else if (role === 'counter') {
          const c = sec.counter?.[i]
          if (c && c !== 'r') addBar(t, start, parseFigure(piece.figures[c], chord, lo(id), piece.key, n), vel, 0.8)
        } else if (role.startsWith('pad')) addBar(t, start, PATTERNS.pad(chord, lo(id), n, role === 'pad3' ? [0, 1, 2] : [0, 2]), vel, 0.7)
        else if (PATTERNS[role]) addBar(t, start, PATTERNS[role](chord, lo(id), n), vel, id === 'cello' ? 0.9 : 0.8)
        else if (DRUM_PATTERNS[role]) addBar(t, start, DRUM_PATTERNS[role](n), vel, 0.9)
        else throw new Error(`Unknown role ${role} for ${id}`)
      }
      if (sec.crashAtStart && i === 0) addBar(tracks.drums, start, [{ beat: 0, dur: 0.5, midi: KIT.crash }], 1, 0.9)
      if (sec.crashAtEnd && i === nb - 1) addBar(tracks.drums, start, [{ beat: 0, dur: 0.5, midi: KIT.crash }], 1, 0.9)
    }
  }
  return { tracks, totalBars: bar }
}
