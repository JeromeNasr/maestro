// Renders the original compositions to Standard MIDI Files in public/midi/ plus a manifest used by tests.
// Run:  npm run generate:midi        Output is deterministic (no randomness).
import midiPkg from '@tonejs/midi'
const { Midi } = midiPkg
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PARTS, compose } from './music/compose.mjs'
import { PIECES } from './music/pieces.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public/midi')
mkdirSync(outDir, { recursive: true })
const PPQ = 480
const manifest = []

for (const piece of PIECES) {
  const { tracks, totalBars } = compose(piece)
  const midi = new Midi()
  midi.header.name = piece.title
  midi.header.setTempo(piece.bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [piece.meter, 4], measures: 0 })
  midi.header.meta.push({ ticks: 0, type: 'copyrightNotice', text: 'Original composition for MAESTRO. Released under CC0-1.0 (public domain dedication).' })

  // Ritardando over the last bars: one tempo mark per beat, easing from the base tempo down to ~82% of it.
  const totalBeats = totalBars * piece.meter
  const ritBeats = piece.ritBars * piece.meter
  const tempos = [{ beat: 0, bpm: piece.bpm }]
  for (let i = 0; i < ritBeats; i++) tempos.push({ beat: totalBeats - ritBeats + i, bpm: Math.round(piece.bpm * (1 - 0.18 * (i / ritBeats)) * 10) / 10 })
  midi.header.tempos.length = 0
  for (const t of tempos) midi.header.tempos.push({ ticks: Math.round(t.beat * PPQ), bpm: t.bpm })

  let noteCount = 0
  const used = []
  for (const p of PARTS) {
    const notes = tracks[p.id]
    if (notes.length === 0) continue
    const t = midi.addTrack()
    t.name = p.name
    t.channel = p.channel
    if (p.program !== null) t.instrument.number = p.program
    for (const n of notes) t.addNote({ midi: n.midi, ticks: Math.round(n.startBeat * PPQ), durationTicks: Math.max(1, Math.round(n.duration * PPQ)), velocity: n.velocity })
    noteCount += notes.length
    used.push(p.name)
  }

  const file = `${piece.id}.mid`
  writeFileSync(join(outDir, file), Buffer.from(midi.toArray()))
  let sec = 0
  for (let i = 0; i < tempos.length; i++) {
    const from = tempos[i].beat
    const to = i + 1 < tempos.length ? tempos[i + 1].beat : totalBeats
    sec += ((to - from) * 60) / tempos[i].bpm
  }
  manifest.push({ id: piece.id, file, title: piece.title, bars: totalBars, meter: piece.meter, bpm: piece.bpm, notes: noteCount, durationSec: Math.round(sec * 10) / 10, tracks: used })
  console.log(`${file}: ${totalBars} bars of ${piece.meter}/4, ${noteCount} notes, ${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}, tracks: ${used.join(', ')}`)
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
