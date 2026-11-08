#!/usr/bin/env node
/**
 * Builds MAESTRO's classical repertoire (public/midi/*.mid + public/midi/classics.json) from the Mutopia Project's
 * LilyPond sources, whose headers carry a per-piece licence.
 *
 *   node scripts/music/build-classics.mjs [--only <id>[,<id>]]
 *
 * Requires: node >= 22, git, LilyPond >= 2.24 (apt install lilypond), network access to github.com.
 *
 * The OUTPUT is committed, so nobody needs this script to run the app. It exists so every note in every shipped file can be
 * traced to a pinned commit of a source with a stated licence, and so the (small, mechanical) edits are auditable:
 *   - `convert-ly` updates old LilyPond syntax (no musical change);
 *   - Vivaldi: the staccatissimo shorthand `-|` no longer exists in LilyPond 2.24 and is replaced by `-!` (same articulation);
 *   - Mozart: three layout-only markup helpers that LilyPond 2.24 no longer predefines are stubbed (affects page footers only);
 *   - MIDI post-processing: tracks are given instrument names/GM programs; double basses sound an octave below written pitch
 *     (as for every orchestral bass part); some pieces get a double-bass line doubling the cellos at the octave below
 *     (standard practice; stated per piece); a reference tempo is set for pieces whose source has no usable one.
 * Nothing else is changed: no note is added, removed or moved.
 */
import midiPkg from '@tonejs/midi'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const { Midi } = midiPkg

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE = join(ROOT, '.cache')
const REPO = { url: 'https://github.com/MutopiaProject/MutopiaProject', commit: '2144afd6f52d56c5b6995b8b589ef1268b3139f0' }
const OUT = join(ROOT, 'public', 'midi')
const only = (() => {
  const i = process.argv.indexOf('--only')
  return i > 0 ? new Set(process.argv[i + 1].split(',')) : null
})()

const GM = { flute: 73, oboe: 68, clarinet: 71, bassoon: 70, horn: 60, trumpet: 56, timpani: 47, violin: 40, viola: 41, cello: 42, bass: 43 }
const V = (name, program) => ({ name, program })

/** `tracks`: one entry per non-empty MIDI track, in order. `drop`: tracks to leave out (named, with the reason). */
const PIECES = [
  {
    id: 'beethoven-symphony-5-i',
    dir: 'ftp/BeethovenLv/O67/Symphony5_1',
    work: { ly: 'Symphony5_1-lys/Symphony5_1.ly', midi: 'out.midi' },
    tempo: 144,
    tracks: [V('Flutes', GM.flute), V('Oboes', GM.oboe), V('Clarinets', GM.clarinet), V('Bassoons', GM.bassoon), V('Horns', GM.horn), V('Trumpets', GM.trumpet), V('Timpani', GM.timpani), V('Violins I', GM.violin), V('Violins II', GM.violin), V('Violas', GM.viola), V('Cellos', GM.cello), { ...V('Double basses', GM.bass), octave: -1 }],
    notes: ['Reference tempo set to 144 (the typeset file uses 192 for its own MIDI); you set the real tempo by conducting.', 'Double basses sound an octave below written pitch.', 'Repeats are unfolded (the exposition repeat is played).'],
  },
  {
    id: 'mozart-nachtmusik-i',
    dir: 'ftp/MozartWA/KV525/MozartWA-KV525',
    work: { cwd: 'MozartWA-KV525-lys/parts', ly: 'MozartWA-KV525-midi.ly', midi: '../../MozartWA-KV525-mov-01.midi' },
    patch: 'mozart',
    tracks: [V('Violins I', GM.violin), V('Violins II', GM.violin), V('Violas', GM.viola), V('Cellos', GM.cello)],
    addBasses: 'Double basses double the cellos an octave below (the score writes cello and double bass on one staff).',
    notes: ['Dynamics are the typesetter’s MIDI velocities.'],
  },
  {
    id: 'mozart-nachtmusik-ii',
    dir: 'ftp/MozartWA/KV525/MozartWA-KV525',
    work: { cwd: 'MozartWA-KV525-lys/parts', ly: 'MozartWA-KV525-midi.ly', midi: '../../MozartWA-KV525-mov-02.midi' },
    patch: 'mozart',
    tracks: [V('Violins I', GM.violin), V('Violins II', GM.violin), V('Violas', GM.viola), V('Cellos', GM.cello)],
    addBasses: 'Double basses double the cellos an octave below (the score writes cello and double bass on one staff).',
    notes: [],
  },
  {
    id: 'vivaldi-spring-i',
    dir: 'ftp/VivaldiA/O8/spring',
    work: { ly: 'spring-lys/spring-score.ly', midi: 'out.midi' },
    patch: 'vivaldi',
    tracks: [V('Violin solo', GM.violin), V('Violins I', GM.violin), V('Violins II', GM.violin), V('Violas', GM.viola), V('Cellos', GM.cello)],
    addBasses: 'Double basses double the cellos an octave below (continuo practice; the source has no separate bass part).',
    notes: ['The source also contains movements II and III; only I (Allegro) is included.'],
  },
  {
    id: 'bach-brandenburg-1-i',
    dir: 'ftp/BachJS/BWV1046/Brandenburg1-1',
    work: { ly: 'Brandenburg1-1-lys/score.ly', midi: 'out.midi' },
    tracks: [V('Horns I', GM.horn), V('Horns II', GM.horn), V('Oboes I', GM.oboe), V('Oboes II', GM.oboe), V('Oboes III', GM.oboe), V('Bassoon', GM.bassoon), { drop: 'Violino piccolo: the typeset MIDI plays it a minor third above the written key and it clashes with the harmony (it doubles Violins I)' }, V('Violins I', GM.violin), V('Violins II', GM.violin), V('Violas', GM.viola), V('Cellos', GM.cello), { ...V('Double basses', GM.bass), octave: -1 }],
    notes: ['The violino piccolo part is left out (see above); Violins I carry the same line.'],
  },
]

// ───────── helpers ─────────
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...opts }).toString()
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))

function ensureSources(dirs) {
  const dest = join(CACHE, 'mutopia')
  if (!existsSync(join(dest, '.git'))) {
    mkdirSync(CACHE, { recursive: true })
    run('git', ['clone', '--filter=blob:none', '--no-checkout', REPO.url, dest])
  }
  run('git', ['-C', dest, 'sparse-checkout', 'set', '--no-cone', ...dirs.map((d) => `/${d}/`)])
  run('git', ['-C', dest, 'checkout', '-q', REPO.commit])
  return dest
}

function findSourceMeta(dir) {
  const files = walk(dir).filter((f) => /\.(ly|ily)$/.test(f))
  const pick = (re) => {
    for (const f of files) {
      const m = re.exec(readFileSync(f, 'utf8'))
      if (m) return m[1].trim()
    }
    return null
  }
  const license = pick(/^\s*license\s*=\s*"([^"]+)"/m)
  const copyright = pick(/^\s*copyright\s*=\s*"([^"]+)"/m)
  return {
    license: license ?? copyright,
    maintainer: pick(/^\s*maintainer\s*=\s*"([^"]+)"/m),
    source: pick(/^\s*source\s*=\s*"([^"]+)"/m),
    title: pick(/^\s*mutopiatitle\s*=\s*"([^"]+)"/m),
    date: pick(/^\s*date\s*=\s*"([^"]+)"/m),
  }
}

function patchSources(work, kind) {
  const all = walk(work).filter((f) => /\.(ly|ily)$/.test(f))
  try {
    run('convert-ly', ['-e', ...all])
  } catch {
    /* convert-ly exits non-zero when it only warns; the compile below is the real check */
  }
  if (kind === 'vivaldi') {
    // (a) the removed staccatissimo shorthand; (b) beam-setting calls from LilyPond 2.12 that no longer exist (they sit in
    // movements II/III's files and only affect engraving of beams, not pitches or durations).
    for (const f of all) writeFileSync(f, readFileSync(f, 'utf8').replaceAll('-|', '-!').replace(/#\s*\(revert-auto-beam-setting[^\n]*\)/g, ''))
  }
  if (kind === 'mozart') {
    const styles = join(work, 'MozartWA-KV525-lys', 'common', 'styles.ily')
    const stubs = [
      '#(define (print-page-number-check-first layout props arg) (interpret-markup layout props arg))',
      '#(define (part-first-page layout props arg) (interpret-markup layout props arg))',
      '#(define (not-part-first-page layout props arg) empty-stencil)',
    ].join('\n')
    writeFileSync(styles, `${stubs}\n${readFileSync(styles, 'utf8')}`)
  }
}

function buildPiece(piece, srcRoot) {
  const work = join(CACHE, 'lily', piece.id)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(dirname(work), { recursive: true })
  cpSync(join(srcRoot, piece.dir), work, { recursive: true })
  patchSources(work, piece.patch)
  const cwd = join(work, piece.work.cwd ?? dirname(piece.work.ly))
  const ly = piece.work.cwd ? piece.work.ly : piece.work.ly.split('/').pop()
  const outBase = join(work, 'out')
  run('lilypond', ['-dno-print-pages', '-o', outBase, ly], { cwd })
  const midiPath = piece.work.cwd ? join(cwd, piece.work.midi) : join(work, piece.work.midi)
  if (!existsSync(midiPath)) throw new Error(`${piece.id}: LilyPond produced no ${midiPath}`)

  const src = new Midi(readFileSync(midiPath))
  const withNotes = src.tracks.filter((t) => t.notes.length > 0)
  if (withNotes.length !== piece.tracks.length) throw new Error(`${piece.id}: expected ${piece.tracks.length} tracks, the source has ${withNotes.length}`)

  const out = new Midi()
  out.header.name = piece.id
  const meta = findSourceMeta(join(srcRoot, piece.dir))
  const tempoBpm = Math.round((piece.tempo ?? src.header.tempos[0]?.bpm ?? 120) * 100) / 100
  out.header.setTempo(tempoBpm)
  out.header.timeSignatures.push(...src.header.timeSignatures.slice(0, 1).map((t) => ({ ticks: 0, timeSignature: t.timeSignature, measures: 0 })))
  out.header.meta.push({ ticks: 0, type: 'copyrightNotice', text: `${meta.title ?? piece.id}. Typeset by ${meta.maintainer ?? 'unknown'} for the Mutopia Project (${meta.license}). MIDI rendered for MAESTRO — see public/midi/classics.json.` })
  // Rebuild with a common PPQ, keeping tick positions exact when the source PPQ differs.
  const scale = out.header.ppq / src.header.ppq
  let cellos = null
  const used = []
  withNotes.forEach((t, i) => {
    const spec = piece.tracks[i]
    if (spec.drop) {
      used.push({ dropped: spec.drop })
      return
    }
    const tr = out.addTrack()
    tr.name = spec.name
    tr.instrument.number = spec.program
    tr.channel = out.tracks.length - 1 >= 9 ? out.tracks.length : out.tracks.length - 1
    const shift = (spec.octave ?? 0) * 12
    for (const n of t.notes) tr.addNote({ midi: n.midi + shift, ticks: Math.round(n.ticks * scale), durationTicks: Math.max(1, Math.round(n.durationTicks * scale)), velocity: n.velocity })
    if (spec.name === 'Cellos') cellos = t
    used.push({ track: spec.name, program: spec.program, notes: t.notes.length })
  })
  if (piece.addBasses && cellos) {
    const tr = out.addTrack()
    tr.name = 'Double basses'
    tr.instrument.number = GM.bass
    tr.channel = out.tracks.length > 9 ? out.tracks.length : out.tracks.length - 1
    for (const n of cellos.notes) tr.addNote({ midi: n.midi - 12, ticks: Math.round(n.ticks * scale), durationTicks: Math.max(1, Math.round(n.durationTicks * scale)), velocity: n.velocity })
    used.push({ track: 'Double basses', program: GM.bass, notes: cellos.notes.length, doubles: 'Cellos −1 octave' })
  }
  const bytes = out.toArray()
  writeFileSync(join(OUT, `${piece.id}.mid`), bytes)
  const total = out.tracks.reduce((s, t) => s + t.notes.length, 0)
  return {
    id: piece.id,
    file: `${piece.id}.mid`,
    bytes: bytes.length,
    durationSec: +out.duration.toFixed(1),
    notes: total,
    referenceBpm: tempoBpm,
    meter: out.header.timeSignatures[0]?.timeSignature,
    tracks: used,
    mutopia: { repository: REPO.url, commit: REPO.commit, path: piece.dir, ...meta },
    modifications: [...(piece.patch === 'vivaldi' ? ['LilyPond syntax: staccatissimo shorthand -| → -! (same articulation); removed engraving-only beam-setting calls from movements II/III'] : []), ...(piece.patch === 'mozart' ? ['LilyPond layout stubs for 3 removed markup helpers (page footers only)'] : []), 'convert-ly syntax update to LilyPond 2.24', ...(piece.addBasses ? [piece.addBasses] : []), ...piece.notes],
  }
}

mkdirSync(OUT, { recursive: true })
const chosen = PIECES.filter((p) => !only || only.has(p.id))
const srcRoot = ensureSources([...new Set(chosen.map((p) => p.dir))])
const results = []
for (const p of chosen) {
  const r = buildPiece(p, srcRoot)
  results.push(r)
  console.log(`${r.id}: ${r.tracks.filter((t) => t.track).length} tracks, ${r.notes} notes, ${r.durationSec}s @ ${r.referenceBpm} BPM — licence: ${r.mutopia.license}`)
}
const file = join(OUT, 'classics.json')
let all = []
if (existsSync(file) && only) all = JSON.parse(readFileSync(file, 'utf8')).pieces.filter((p) => !only.has(p.id))
writeFileSync(file, `${JSON.stringify({ generatedWith: 'scripts/music/build-classics.mjs', lilypond: run('lilypond', ['--version']).split('\n')[0], pieces: [...all, ...results] }, null, 1)}\n`)
void relative
void statSync
