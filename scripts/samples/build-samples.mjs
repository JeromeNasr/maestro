#!/usr/bin/env node
/**
 * Builds MAESTRO's orchestral sample set from VSCO-2 Community Edition (Versilian Studios, CC0 1.0).
 *
 *   node scripts/samples/build-samples.mjs            # download (cached) + process + write public/samples
 *   node scripts/samples/build-samples.mjs --only violins,timpani
 *
 * Requires: node >= 22, curl, ffmpeg (with libopus). The OUTPUT (public/samples) is committed, so end users and CI never
 * need this script or the network; it exists so the samples are reproducible and their provenance is auditable.
 *
 * What it does, per instrument:
 *   1. downloads the chosen WAV files from a PINNED commit of github.com/sgossner/VSCO-2-CE (raw.githubusercontent.com),
 *   2. folds to mono @ 48 kHz, trims leading silence,
 *   3. measures each sample's real pitch (autocorrelation) against the pitch in its filename, and records the
 *      correction in cents so playback is in tune with equal temperament, A = 440 Hz (and reports any mismatch),
 *   4. sustained instruments: bakes a seamless crossfaded loop so a note can be held for any length,
 *   5. normalises level, encodes Opus/Ogg, and writes public/samples/manifest.json.
 */
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const COMMIT = '440300901dfe9275fd84e0b7763af1f8443ae62e'
const RAW = `https://raw.githubusercontent.com/sgossner/VSCO-2-CE/${COMMIT}`
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE = join(ROOT, '.cache', 'vsco')
const OUT = join(ROOT, 'public', 'samples')
const SR = 48000
const BITRATE = '56k'

const only = (() => {
  const i = process.argv.indexOf('--only')
  return i > 0 ? new Set(process.argv[i + 1].split(',')) : null
})()

// ───────── instrument table ─────────
// dir: folder inside the VSCO-2-CE repo. The pitch in each file name uses the "C3 = middle C" convention (checked below
// against the measured pitch of every sample).
const SUSTAINED = [
  { id: 'violins', section: 'strings', label: 'Violins (section, vibrato)', dir: 'Strings/Violin Section/susVib', release: 0.38, trim: 1.0 },
  { id: 'violas', section: 'strings', label: 'Violas (section, vibrato)', dir: 'Strings/Viola Section/susvib', release: 0.38, trim: 1.0 },
  { id: 'cellos', section: 'strings', label: 'Cellos (section, vibrato)', dir: 'Strings/Cello Section/susvib', release: 0.4, trim: 1.0 },
  { id: 'basses', section: 'strings', label: 'Double bass (solo, vibrato)', dir: 'Strings/Solo Contrabass/SusVib', release: 0.35, trim: 1.1 },
  { id: 'flutes', section: 'woodwinds', label: 'Flute (solo, vibrato)', dir: 'Woodwinds/Flute/susvib', release: 0.18, trim: 1.1 },
  { id: 'oboes', section: 'woodwinds', label: 'Oboe (solo, vibrato)', dir: 'Woodwinds/Oboe/Vib', release: 0.16, trim: 1.0 },
  { id: 'clarinets', section: 'woodwinds', label: 'Clarinet (solo, sustained)', dir: 'Woodwinds/Clarinet/susLong', release: 0.16, trim: 1.0 },
  { id: 'bassoons', section: 'woodwinds', label: 'Bassoon (solo, vibrato)', dir: 'Woodwinds/Bassoon/vib', release: 0.18, trim: 1.1 },
  { id: 'horns', section: 'brass', label: 'French horn (solo)', dir: 'Brass/F Horn/sus', release: 0.22, trim: 1.0 },
  { id: 'trumpets', section: 'brass', label: 'Trumpet (solo, vibrato)', dir: 'Brass/Trumpet/susvib', release: 0.14, trim: 0.9 },
  { id: 'trombones', section: 'brass', label: 'Tenor trombone (solo)', dir: 'Brass/Tenor Trombone/sus', release: 0.18, trim: 1.0 },
  { id: 'tuba', section: 'brass', label: 'Tuba (solo)', dir: 'Brass/Tuba/sus', release: 0.2, trim: 1.1 },
]

// One-shots. `layers`: files by approximate loudness (soft → loud). `pitched`: estimate the drum's pitch.
const HITS = [
  { id: 'timpani', section: 'percussion', label: 'Timpani (5 drums)', pitched: true, maxSec: 3.6, fadeSec: 0.4, peak: 0.9,
    voices: [1, 2, 3, 4, 5].map((n) => ({ name: `drum${n}`, glob: new RegExp(`^Percussion/Timpani/Timpani${n}_Hit_v\\d_rr1_Sum\\.wav$`) })) },
  { id: 'bassDrum', section: 'percussion', label: 'Bass drum', maxSec: 3.0, fadeSec: 0.4, peak: 0.9,
    voices: [{ name: 'hit', layers: ['Percussion/BDrumNewhit_v2_rr1_Sum.wav', 'Percussion/BDrumNewhit_v4_rr1_Sum.wav', 'Percussion/BDrumNewhit_v6_rr1_Sum.wav'] }] },
  { id: 'snareDrum', section: 'percussion', label: 'Snare drum', maxSec: 0.9, fadeSec: 0.15, peak: 0.85,
    voices: [{ name: 'hit', layers: ['Percussion/Snare2-HitSN_v1_rr1_Sum.wav', 'Percussion/Snare2-HitSN_v5_rr1_Sum.wav', 'Percussion/Snare2-HitSN_v9_rr1_Sum.wav'] }] },
  { id: 'cymbals', section: 'percussion', label: 'Crash / suspended cymbal', maxSec: 4.5, fadeSec: 0.9, peak: 0.8,
    voices: [{ name: 'hit', layers: ['VSCO 1 Percussion/varMetal/Cymbals/clash/crash_hit_pp_loose.wav', 'VSCO 1 Percussion/varMetal/Cymbals/clash/crash_hit_mp_loose.wav', 'VSCO 1 Percussion/varMetal/Cymbals/clash/crash_hit_ff_loose.wav'] }] },
  { id: 'triangle', section: 'percussion', label: 'Triangle', maxSec: 2.5, fadeSec: 0.5, peak: 0.7,
    voices: [{ name: 'hit', layers: ['Percussion/Triangle3-Hit_v1_rr1_Sum.wav', 'Percussion/Triangle3-Hit_v2_rr1_Sum.wav'] }] },
]

// ───────── helpers ─────────
const NOTE_RE = /(?:^|_)([A-G])(#?)(-?\d)_v?(\d)/
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const midiOf = (file) => {
  const m = NOTE_RE.exec(file.split('/').pop())
  if (!m) return null
  return { midi: 12 * (Number(m[3]) + 2) + PC[m[1]] + (m[2] ? 1 : 0), layer: Number(m[4]) }
}
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

function fetchCached(path) {
  const dest = join(CACHE, path)
  if (existsSync(dest) && statSync(dest).size > 1000) return dest
  mkdirSync(dirname(dest), { recursive: true })
  const url = `${RAW}/${path.split('/').map(encodeURIComponent).join('/')}`
  execFileSync('curl', ['-sSf', '--retry', '3', '-m', '120', '-o', dest, url])
  return dest
}

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
  if (r.status !== 0) throw new Error(`ffmpeg decode failed for ${file}: ${r.stderr}`)
  const b = r.stdout
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
}

function encode(samples, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', BITRATE, '-application', 'audio', dest], {
    input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength), maxBuffer: 1 << 26,
  })
  if (r.status !== 0) throw new Error(`ffmpeg encode failed: ${r.stderr}`)
}

const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
const rms = (x, a, b) => {
  let s = 0
  for (let i = a; i < b; i++) s += x[i] * x[i]
  return Math.sqrt(s / Math.max(1, b - a))
}

function trimLeading(x) {
  const thr = Math.max(0.004, peakOf(x) * 0.02)
  let i = 0
  while (i < x.length && Math.abs(x[i]) < thr) i++
  return x.subarray(Math.max(0, i - Math.round(0.004 * SR)))
}

/** Cents by which the sample's measured pitch deviates from `nominalHz`. Autocorrelation within ±6 semitones. */
function centsOff(x, nominalHz, fromSec) {
  const N = 8192
  const start = Math.min(Math.max(0, Math.round(fromSec * SR)), Math.max(0, x.length - N - 4000))
  const seg = x.subarray(start, start + N)
  if (seg.length < N) return { cents: null, strength: 0 }
  const minLag = Math.floor(SR / (nominalHz * 2 ** 0.5))
  const maxLag = Math.ceil(SR / (nominalHz * 2 ** -0.5))
  const half = N >> 1
  let e0 = 0
  for (let i = 0; i < half; i++) e0 += seg[i] * seg[i]
  const ac = new Float64Array(maxLag + 2)
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0
    let e1 = 0
    for (let i = 0; i < half; i++) {
      s += seg[i] * seg[i + lag]
      e1 += seg[i + lag] * seg[i + lag]
    }
    ac[lag] = s / Math.sqrt(e0 * e1 + 1e-12)
  }
  let best = minLag
  for (let lag = minLag; lag <= maxLag; lag++) if (ac[lag] > ac[best]) best = lag
  const a = ac[best - 1]
  const b = ac[best]
  const c = ac[best + 1]
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1)
  const period = best + Math.max(-0.5, Math.min(0.5, shift))
  return { cents: 1200 * Math.log2(SR / period / nominalHz), strength: b }
}

function bakeLoop(x, { maxSec = 3.2, loopStartSec = 0.55, xfadeSec = 0.4 }) {
  const seg = Float32Array.from(x.subarray(0, Math.min(x.length, Math.round(maxSec * SR))))
  const L = seg.length
  const xf = Math.min(Math.round(xfadeSec * SR), Math.floor(L * 0.2))
  const ls = Math.max(xf + 10, Math.min(Math.round(loopStartSec * SR), Math.floor(L * 0.4)))
  for (let i = 0; i < xf; i++) {
    const t = i / xf
    seg[L - xf + i] = seg[L - xf + i] * Math.cos((t * Math.PI) / 2) + seg[ls - xf + i] * Math.sin((t * Math.PI) / 2)
  }
  const fi = Math.round(0.003 * SR)
  for (let i = 0; i < fi; i++) seg[i] *= i / fi
  return { data: seg, loopStart: ls / SR, loopEnd: L / SR, level: rms(seg, ls, L - xf) }
}

function thin(cands, maxCount) {
  if (cands.length <= maxCount) return cands
  const out = [cands[0]]
  const step = (cands.at(-1).midi - cands[0].midi) / (maxCount - 1)
  for (const c of cands) if (c.midi - out.at(-1).midi >= step * 0.75) out.push(c)
  if (out.at(-1) !== cands.at(-1)) out.push(cands.at(-1))
  return out
}

// ───────── main ─────────
const index = readFileSync(join(ROOT, 'scripts', 'samples', 'vsco-files.txt'), 'utf8').split('\n').filter(Boolean)
/** soft / medium / loud layer files for a voice defined by a glob (files sorted by velocity number). */
const layersOf = (v) => {
  if (v.layers) return v.layers
  const all = index.filter((f) => v.glob.test(f)).sort()
  return [...new Set([all[0], all[Math.floor(all.length / 2)], all.at(-1)])]
}
const manifest = { version: 1, generatedWith: 'scripts/samples/build-samples.mjs', source: { name: 'VSCO-2 Community Edition', url: 'https://github.com/sgossner/VSCO-2-CE', commit: COMMIT, license: 'CC0-1.0' }, sampleRate: SR, instruments: {} }
const report = []

for (const inst of SUSTAINED) {
  if (only && !only.has(inst.id)) continue
  const files = index.filter((f) => f.startsWith(`${inst.dir}/`) && f.endsWith('.wav'))
  const parsed = files.map((f) => ({ f, ...midiOf(f) })).filter((p) => p.midi != null)
  const layers = [...new Set(parsed.map((p) => p.layer))].sort((a, b) => a - b)
  const layer = layers[Math.floor(layers.length / 2)]
  const byMidi = new Map()
  // Per pitch use the layer closest to the target one (some pitches exist in only a few layers); keeps the range complete.
  for (const p of parsed) {
    const cur = byMidi.get(p.midi)
    if (!cur || Math.abs(p.layer - layer) < Math.abs(cur.layer - layer)) byMidi.set(p.midi, p)
  }
  const chosen = thin([...byMidi.values()].sort((a, b) => a.midi - b.midi), 12)
  const samples = []
  for (const p of chosen) {
    const raw = trimLeading(decode(fetchCached(p.f)))
    const m = centsOff(raw, hz(p.midi), 0.8)
    const cents = m.cents !== null && m.strength > 0.6 && Math.abs(m.cents) < 70 ? Math.round(m.cents) : 0
    if (m.cents === null || m.strength <= 0.6 || Math.abs(m.cents) >= 70) report.push(`  ? ${inst.id} midi ${p.midi}: pitch check inconclusive (measured ${m.cents?.toFixed(0)}¢, strength ${m.strength.toFixed(2)}) — nominal pitch kept`)
    const loop = bakeLoop(raw, {})
    samples.push({ p, loop, cents })
  }
  // Equalise loudness inside the instrument (so a note sounds as loud as its neighbours), then across instruments.
  const target = 0.1 * inst.trim
  const out = []
  for (const { p, loop, cents } of samples) {
    const g = target / Math.max(1e-6, loop.level)
    for (let i = 0; i < loop.data.length; i++) loop.data[i] *= g
    const pk = peakOf(loop.data)
    if (pk > 0.95) for (let i = 0; i < loop.data.length; i++) loop.data[i] *= 0.95 / pk
    const name = `${inst.id}/${p.midi}.ogg`
    encode(loop.data, join(OUT, name))
    out.push({ file: name, root: p.midi, cents: -cents, loopStart: +loop.loopStart.toFixed(4), loopEnd: +loop.loopEnd.toFixed(4), duration: +(loop.data.length / SR).toFixed(4), src: p.f })
  }
  manifest.instruments[inst.id] = { kind: 'sustained', section: inst.section, label: inst.label, release: inst.release, samples: out }
  console.log(`${inst.id}: ${out.length} samples (layer v${layer}), ${out.map((s) => s.root).join(' ')}`)
}

for (const inst of HITS) {
  if (only && !only.has(inst.id)) continue
  const voices = []
  let globalPeak = 0
  const decoded = inst.voices.map((v) =>
    layersOf(v).map((f) => {
      const x = trimLeading(decode(fetchCached(f)))
      const seg = Float32Array.from(x.subarray(0, Math.min(x.length, Math.round(inst.maxSec * SR))))
      const fade = Math.round(inst.fadeSec * SR)
      for (let i = 0; i < Math.min(fade, seg.length); i++) seg[seg.length - 1 - i] *= (i / fade) ** 1.5
      globalPeak = Math.max(globalPeak, peakOf(seg))
      return { f, seg }
    }),
  )
  const scale = inst.peak / Math.max(1e-6, globalPeak)
  inst.voices.forEach((v, vi) => {
    const layers = decoded[vi].map(({ f, seg }, li) => {
      for (let i = 0; i < seg.length; i++) seg[i] *= scale
      const name = `${inst.id}/${v.name}_l${li + 1}.ogg`
      encode(seg, join(OUT, name))
      return { file: name, duration: +(seg.length / SR).toFixed(4), src: f }
    })
    let root = null
    let cents = 0
    if (inst.pitched) {
      // Pitch of the drum. A timpani's partials sit at ~1 : 1.5 : 2 : 2.5 times its lowest partial, i.e. a 3:4:5:6 harmonic
      // series of a virtual pitch one octave BELOW that lowest partial. Autocorrelation finds the virtual pitch; the
      // drum's sounding (nominal) pitch is twice that. Cross-checked against the lowest spectral peak of each drum.
      const x = decoded[vi].at(-1).seg
      let bestHz = 0
      let bestS = 0
      for (let h = 55; h <= 230; h += 0.5) {
        const m = centsOff(x, h, 0.15)
        if (m.cents !== null && m.strength > bestS) {
          bestS = m.strength
          bestHz = h * 2 ** (m.cents / 1200)
        }
      }
      bestHz *= 2
      const midi = 69 + 12 * Math.log2(bestHz / 440)
      root = Math.round(midi)
      cents = Math.round((midi - root) * 100)
      report.push(`  timpani ${v.name}: measured ${bestHz.toFixed(1)} Hz → MIDI ${root} ${cents >= 0 ? '+' : ''}${cents}¢ (autocorrelation strength ${bestS.toFixed(2)})`)
    }
    voices.push({ name: v.name, root, cents: -cents, layers })
  })
  manifest.instruments[inst.id] = { kind: 'hit', section: inst.section, label: inst.label, voices }
  console.log(`${inst.id}: ${voices.length} voice(s) × ${voices[0].layers.length} layers`)
}

if (only) {
  const prev = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : { instruments: {} }
  manifest.instruments = { ...prev.instruments, ...manifest.instruments }
}
mkdirSync(OUT, { recursive: true })
// Content hash of every sample: the app uses it to version its offline cache, so a rebuild can never serve stale audio.
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ogg') ? [join(d, e.name)] : []))
const h = createHash('sha1')
for (const f of walk(OUT).sort()) h.update(f.slice(OUT.length)).update(readFileSync(f))
manifest.build = h.digest('hex').slice(0, 12)
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
try {
  writeFileSync(join(OUT, 'LICENSE-VSCO-2-CE.txt'), `VSCO-2 Community Edition — ${manifest.source.url} (commit ${COMMIT})\nLicensed under CC0 1.0 Universal. Full text: https://creativecommons.org/publicdomain/zero/1.0/legalcode\n\n${execFileSync('curl', ['-sSf', '-m', '60', `${RAW}/LICENSE`]).toString()}`)
} catch (e) {
  console.warn('Could not fetch the licence text:', e.message)
}
if (report.length) console.log(`\nNotes:\n${report.join('\n')}`)
