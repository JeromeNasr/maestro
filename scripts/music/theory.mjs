// Minimal music theory for the original MAESTRO compositions. Pure functions, no dependencies.
export const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], dim: [0, 3, 6], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10] }
const mod = (n, m) => ((n % m) + m) % m

/** 'D', 'Bm', 'A7', 'F#m' → { root: pitch class, intervals } */
export function parseChord(symbol) {
  const m = /^([A-G][#b]?)(m7|maj7|m|dim|7)?$/.exec(symbol)
  if (!m) throw new Error(`Unknown chord symbol: ${symbol}`)
  return { symbol, root: PC[m[1]], intervals: QUALITY[m[2] ?? ''] }
}

/** Lowest MIDI note >= lo whose pitch class is the chord root. */
export function rootAtOrAbove(chord, lo) {
  let m = lo
  while (mod(m, 12) !== chord.root) m++
  return m
}

/** Chord-tone ladder: index 0,1,2 = root, third, fifth; 3 = octave root, … ; negatives go below. */
export function ladder(chord, rootMidi, i) {
  const tri = chord.intervals.slice(0, 3)
  return rootMidi + tri[mod(i, 3)] + 12 * Math.floor(i / 3)
}

/** Move `steps` scale degrees from a pitch within the major key. */
export function stepScale(midi, steps, keyRoot) {
  const scale = new Set([0, 2, 4, 5, 7, 9, 11].map((x) => mod(x + keyRoot, 12)))
  const dir = Math.sign(steps)
  let m = midi
  for (let k = 0; k < Math.abs(steps); k++) {
    do m += dir
    while (!scale.has(mod(m, 12)))
  }
  return m
}

/**
 * Parse a figure like "c0:1 c1:.5 s-1:.5 r:1" for one bar.
 *   cN  = Nth chord tone of the bar's chord (ladder)     sN = N scale steps from the previous pitch     r = rest
 * Returns events with beat offsets inside the bar. Throws if the bar length is wrong (catches arithmetic slips).
 */
export function parseFigure(figure, chord, lo, keyRoot, beatsPerBar) {
  const root = rootAtOrAbove(chord, lo)
  const out = []
  let beat = 0
  let prev = null
  for (const tok of figure.trim().split(/\s+/)) {
    const [what, durStr] = tok.split(':')
    const dur = Number(durStr)
    if (!(dur > 0)) throw new Error(`Bad duration in "${tok}"`)
    if (what !== 'r') {
      let midi
      if (what[0] === 'c') midi = ladder(chord, root, Number(what.slice(1)))
      else if (what[0] === 's') midi = stepScale(prev ?? root, Number(what.slice(1)), keyRoot)
      else throw new Error(`Bad token ${tok}`)
      out.push({ beat, dur, midi })
      prev = midi
    }
    beat += dur
  }
  if (Math.abs(beat - beatsPerBar) > 1e-9) throw new Error(`Figure "${figure}" is ${beat} beats, bar is ${beatsPerBar}`)
  return out
}
