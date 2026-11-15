import { SECTIONS, type SectionId } from '@/orchestra/sections'
import type { AudioBackend, BackendInfo, LoadProgress } from './backend'
import { DEFAULT_INSTRUMENT, INSTRUMENTS, SAMPLE_SET_OF, instrumentInfo, type InstrumentId } from './instruments'
import { midiToHz } from './pitch'
import { layerIndex, nearestDrum, nearestSample, playbackRate, velocityGain, type BankEntry, type HitVoice, type SampleManifest, type SustainedSample } from './sampleBank'
import type { ScheduledNote } from './sequencer'

/**
 * Sample-based orchestra on raw Web Audio (no Tone.js: fewer bytes to load, fewer nodes, one less scheduler).
 *
 *   note → [instrument bus: trim → stereo pan] → [section bus: low-pass (brightness) → gain (mixer × dynamics)] → master
 *        → gate → make-up → limiter → soft clipper → speakers;   section bus → reverb send → convolution hall → master
 *
 * Sounds are real recordings (VSCO-2 Community Edition, CC0): sustained instruments carry a baked seamless loop so any
 * note length works, and are re-pitched by playback rate (never by time-stretching, so tempo changes cannot alter pitch);
 * percussion are one-shots with velocity layers. Only the instruments a piece uses are downloaded and decoded.
 */

/** Notes are only handed to Web Audio this far ahead of their time, so `silence()` can still cancel the rest. */
const FLUSH_AHEAD_S = 0.07
/** Overall make-up gain before the limiter (samples are normalised to −20 dBFS RMS per voice). */
const MAKEUP_GAIN = 2.2
const MAX_VOICES_PER_INSTRUMENT = 22
const LOAD_CONCURRENCY = 4
const SECTION_REVERB: Record<SectionId, number> = { strings: 0.5, woodwinds: 0.55, brass: 0.7, percussion: 0.85 }

interface Pending { n: ScheduledNote; epoch: number }
interface Voice { src: AudioScheduledSourceNode; gain: GainNode; inst: InstrumentId; endsAt: number }

export interface SampledBackendOptions {
  /** Folder that holds manifest.json and the .ogg files (with trailing slash). */
  baseUrl?: string
  contextFactory?: () => AudioContext
  /** Fetch bytes (default: Cache-API-backed fetch, so a second visit needs no network). */
  fetchBytes?: (url: string, cacheName: string) => Promise<ArrayBuffer>
}

export class SampleLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SampleLoadError'
  }
}

/** Fetch with the Cache API (when available) so decoded-on-demand audio is served offline after the first visit. */
export async function fetchBytesCached(url: string, cacheName: string): Promise<ArrayBuffer> {
  if (typeof caches === 'undefined') return fetchPlain(url)
  const cache = await caches
    .open(cacheName)
    .catch(() => null) // storage blocked (private mode, quota): go straight to the network
  try {
    const hit = await cache?.match(url)
    if (hit) return await hit.arrayBuffer()
  } catch {
    /* unreadable cache entry: fetch it again */
  }
  const res = await fetch(url)
  if (!res.ok) throw new SampleLoadError(`Could not load ${url} (HTTP ${res.status})`)
  if (cache) void cache.put(url, res.clone()).catch(() => undefined)
  return res.arrayBuffer()
}

async function fetchPlain(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new SampleLoadError(`Could not load ${url} (HTTP ${res.status})`)
  return res.arrayBuffer()
}

/** Deterministic procedural concert-hall impulse response (decorrelated stereo noise with a darkening tail). */
export function makeHallImpulse(ctx: BaseAudioContext, seconds = 2.4, seed = 7): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.floor(seconds * sr)
  const buf = ctx.createBuffer(2, len, sr)
  let s = seed >>> 0
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296 - 0.5
  }
  const tau = seconds / 6.9 // −60 dB at the end
  const pre = Math.floor(0.018 * sr)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let y = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr
      const a = 0.12 + 0.8 * Math.exp(-t / 0.5) // high frequencies die first
      y += a * (rnd() * 2 - y)
      d[i] = y * Math.exp(-t / tau)
    }
  }
  return buf
}

export class SampledBackend implements AudioBackend {
  info: BackendInfo = { kind: 'sampled' }
  private ctx: AudioContext | null = null
  private manifest: SampleManifest | null = null
  private cacheName = 'maestro-samples'
  private buffers = new Map<string, AudioBuffer>()
  private ready = new Set<InstrumentId>()
  private instBus = new Map<InstrumentId, GainNode>()
  private secFilter = new Map<SectionId, BiquadFilterNode>()
  private secGain = new Map<SectionId, GainNode>()
  private secMeter = new Map<SectionId, AnalyserNode>()
  private master: GainNode | null = null
  private gate: GainNode | null = null
  private nodes: AudioNode[] = []
  private pending: Pending[] = []
  private voices: Voice[] = []
  private epoch = 0
  private meterBuf: Float32Array<ArrayBuffer> = new Float32Array(1024)
  private decodedBytes = 0

  constructor(private opts: SampledBackendOptions = {}) {}

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  async init(): Promise<void> {
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!this.opts.contextFactory && !Ctor) throw new Error('This browser does not support the Web Audio API.')
    // Fetch the manifest first: if the sample set is missing there is no point starting audio (the caller falls back).
    const base = this.baseUrl()
    try {
      const res = await fetch(`${base}manifest.json`, { cache: 'no-cache' })
      if (!res.ok) throw new SampleLoadError(`The orchestral sample library is missing (HTTP ${res.status}).`)
      this.manifest = (await res.json()) as SampleManifest
    } catch (e) {
      throw e instanceof SampleLoadError ? e : new SampleLoadError('The orchestral sample library could not be loaded.', { cause: e })
    }
    this.cacheName = `maestro-samples-${this.manifest.build ?? this.manifest.source.commit.slice(0, 8)}`
    void this.pruneOldCaches()

    const ctx = this.opts.contextFactory ? this.opts.contextFactory() : new Ctor!({ latencyHint: 'interactive' })
    this.ctx = ctx
    try {
      await ctx.resume() // must follow a user gesture, otherwise the browser leaves it suspended
    } catch (e) {
      throw new Error(`The browser blocked audio (${e instanceof Error ? e.message : 'autoplay policy'}). Click Start again.`, { cause: e })
    }
    if (ctx.state !== 'running') throw new Error('The audio context did not start. Click Start again.')
    this.build(ctx)
    this.info = { kind: 'sampled', sampleRate: ctx.sampleRate, baseLatencySec: ctx.baseLatency, contextState: ctx.state, detail: `${this.manifest.source.name} (${this.manifest.source.license})` }
  }

  private baseUrl(): string {
    return this.opts.baseUrl ?? `${import.meta.env.BASE_URL ?? '/'}samples/`
  }

  private async pruneOldCaches() {
    try {
      if (typeof caches === 'undefined') return
      for (const k of await caches.keys()) if (k.startsWith('maestro-samples') && k !== this.cacheName) await caches.delete(k)
    } catch {
      /* best effort */
    }
  }

  private track<T extends AudioNode>(n: T): T {
    this.nodes.push(n)
    return n
  }

  private build(ctx: AudioContext) {
    // Output chain: … → make-up → limiter → tanh soft clipper (ceiling ≈ −0.3 dBFS) → speakers. Every stage before the make-up
    // is an attenuator, so the user always has headroom; the limiter and clipper make clipping impossible.
    const clipper = this.track(ctx.createWaveShaper())
    const curve = new Float32Array(2048)
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1
      curve[i] = (Math.tanh(x * 1.2 * 2) / Math.tanh(1.2 * 2)) * 0.97
    }
    clipper.curve = curve
    clipper.oversample = '2x'
    clipper.connect(ctx.destination)
    const limiter = this.track(ctx.createDynamicsCompressor())
    limiter.threshold.value = -6
    limiter.knee.value = 4
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.12
    limiter.connect(clipper)
    const makeup = this.track(ctx.createGain())
    makeup.gain.value = MAKEUP_GAIN
    makeup.connect(limiter)
    this.gate = this.track(ctx.createGain())
    this.gate.connect(makeup)
    this.master = this.track(ctx.createGain())
    this.master.gain.value = 0.8
    this.master.connect(this.gate)

    const hall = this.track(ctx.createConvolver())
    hall.buffer = makeHallImpulse(ctx)
    const hallReturn = this.track(ctx.createGain())
    hallReturn.gain.value = 0.3
    hall.connect(hallReturn)
    hallReturn.connect(this.master)

    for (const { id } of SECTIONS) {
      const filter = this.track(ctx.createBiquadFilter())
      filter.type = 'lowpass'
      filter.frequency.value = 6000
      filter.Q.value = 0.5
      const gain = this.track(ctx.createGain())
      gain.gain.value = 0
      const meter = this.track(ctx.createAnalyser())
      meter.fftSize = 1024
      const send = this.track(ctx.createGain())
      send.gain.value = SECTION_REVERB[id]
      filter.connect(gain)
      gain.connect(this.master)
      gain.connect(meter)
      gain.connect(send)
      send.connect(hall)
      this.secFilter.set(id, filter)
      this.secGain.set(id, gain)
      this.secMeter.set(id, meter)
    }
    for (const inst of INSTRUMENTS) {
      const trim = this.track(ctx.createGain())
      const pan = this.track(ctx.createStereoPanner())
      pan.pan.value = inst.pan
      trim.connect(pan)
      pan.connect(this.secFilter.get(inst.section)!)
      this.instBus.set(inst.id, trim)
    }
  }

  // ───────────── sample loading ─────────────

  /** Instruments (sample sets) needed by the given instruments: Violins II reuse the violin recordings. */
  private setsFor(instruments: InstrumentId[]): string[] {
    return [...new Set(instruments.map((i) => SAMPLE_SET_OF[i] ?? i))]
  }

  /** Download + decode the sample sets for these instruments (idempotent, resumable, reports progress). */
  async prepare(instruments: InstrumentId[], onProgress?: (p: LoadProgress) => void): Promise<void> {
    const ctx = this.ctx
    const manifest = this.manifest
    if (!ctx || !manifest) throw new Error('Audio is not initialised')
    const sets = this.setsFor(instruments).filter((id) => manifest.instruments[id])
    const jobs: { set: string; file: string }[] = []
    for (const set of sets) {
      for (const f of filesOf(manifest.instruments[set])) if (!this.buffers.has(f)) jobs.push({ set, file: f })
    }
    const total = jobs.length
    let loaded = 0
    onProgress?.({ loaded, total, instrument: '' })
    const fetchBytes = this.opts.fetchBytes ?? fetchBytesCached
    let next = 0
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++]
        try {
          const bytes = await fetchBytes(`${this.baseUrl()}${job.file}`, this.cacheName)
          const buf = await ctx.decodeAudioData(bytes)
          this.buffers.set(job.file, buf)
          this.decodedBytes += buf.length * buf.numberOfChannels * 4
        } catch (e) {
          throw new SampleLoadError(`Could not load the ${job.set} samples (${job.file}): ${e instanceof Error ? e.message : String(e)}`, { cause: e })
        }
        loaded++
        onProgress?.({ loaded, total, instrument: job.set })
      }
    }
    await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, Math.max(1, total)) }, worker))
    for (const id of instruments) this.ready.add(id)
    this.info = { ...this.info, detail: `${this.info.detail?.split(' · ')[0] ?? ''} · ${this.buffers.size} samples, ${(this.decodedBytes / 1048576).toFixed(0)} MB decoded` }
  }

  // ───────────── playing ─────────────

  scheduleNote(n: ScheduledNote) {
    this.pending.push({ n, epoch: this.epoch })
  }

  pump() {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const keep: Pending[] = []
    for (const p of this.pending) {
      if (p.epoch !== this.epoch) continue
      if (p.n.timeSec - now <= FLUSH_AHEAD_S) this.sound(p.n, Math.max(p.n.timeSec, now))
      else keep.push(p)
    }
    this.pending = keep
    if (this.voices.length > 0) this.voices = this.voices.filter((v) => v.endsAt > now - 0.1)
  }

  private sound(n: ScheduledNote, time: number) {
    const inst = n.instrument ?? DEFAULT_INSTRUMENT[n.section]
    try {
      const set = SAMPLE_SET_OF[inst] ?? inst
      const entry = this.manifest?.instruments[set]
      if (entry && this.ready.has(inst)) {
        if (entry.kind === 'sustained') this.playSustained(inst, entry, n, time)
        else this.playHit(inst, entry, n, time)
      } else this.playFallback(inst, n, time)
    } catch {
      /* a single voice failing must not stop the music */
    }
  }

  private connectVoice(inst: InstrumentId, src: AudioScheduledSourceNode, level: number, time: number, endsAt: number): GainNode {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(level, time + 0.012)
    src.connect(g)
    g.connect(this.instBus.get(inst)!)
    // Voice stealing: never more than N per instrument, the oldest one is released quickly.
    const same = this.voices.filter((v) => v.inst === inst)
    if (same.length >= MAX_VOICES_PER_INSTRUMENT) this.release(same[0], time)
    const voice: Voice = { src, gain: g, inst, endsAt }
    this.voices.push(voice)
    src.onended = () => {
      try {
        g.disconnect()
      } catch {
        /* already gone */
      }
      this.voices = this.voices.filter((v) => v !== voice)
    }
    return g
  }

  private release(v: Voice, at: number, tau = 0.03) {
    try {
      v.gain.gain.cancelScheduledValues(at)
      v.gain.gain.setTargetAtTime(0, at, tau)
      v.src.stop(at + tau * 6)
      v.endsAt = at + tau * 6
    } catch {
      /* already stopped */
    }
  }

  private playSustained(inst: InstrumentId, entry: Extract<BankEntry, { kind: 'sustained' }>, n: ScheduledNote, time: number) {
    const ctx = this.ctx!
    const s: SustainedSample = nearestSample(entry.samples, n.midi)
    const buffer = this.buffers.get(s.file)
    if (!buffer) return this.playFallback(inst, n, time)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    // Ensemble character: a few cents of random detune per note (a section is never perfectly in tune with itself);
    // Violins II are a touch sharper than Violins I so the two desks do not phase together.
    const extra = (inst === 'violins2' ? 4 : 0) + (Math.random() - 0.5) * 5
    src.playbackRate.value = playbackRate(n.midi, s.root, s.cents, extra)
    src.loop = true
    src.loopStart = s.loopStart
    src.loopEnd = s.loopEnd
    const dur = Math.max(0.1, n.durationSec)
    const end = time + dur
    const release = entry.release
    const level = velocityGain(n.velocity)
    const g = this.connectVoice(inst, src, level, time, end + release * 1.5)
    // Legato-ish: hold at level, then release exponentially.
    g.gain.setValueAtTime(level, end)
    g.gain.setTargetAtTime(0, end, release / 3)
    src.start(time)
    src.stop(end + release * 1.5 + 0.05)
  }

  private playHit(inst: InstrumentId, entry: Extract<BankEntry, { kind: 'hit' }>, n: ScheduledNote, time: number) {
    const ctx = this.ctx!
    let voice: HitVoice = entry.voices[0]
    let rate = 1
    if (inst === 'timpani' && !n.kit) {
      voice = nearestDrum(entry.voices, n.midi)
      if (voice.root !== null) rate = playbackRate(n.midi, voice.root, voice.cents)
    }
    const layer = voice.layers[layerIndex(n.velocity, voice.layers.length)]
    const buffer = this.buffers.get(layer.file)
    if (!buffer) return this.playFallback(inst, n, time)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = Math.min(2, Math.max(0.5, rate))
    const level = 0.35 + 0.65 * Math.min(1, n.velocity) ** 0.8 // the layers already carry the loudness difference
    this.connectVoice(inst, src, level, time, time + buffer.duration / src.playbackRate.value)
    src.start(time)
  }

  /** Used only while an instrument's samples are missing or not yet loaded: a plain, quiet tone so nothing is silent. */
  private playFallback(inst: InstrumentId, n: ScheduledNote, time: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = instrumentInfo(inst).section === 'brass' ? 'sawtooth' : 'triangle'
    osc.frequency.value = n.kit ? 180 : midiToHz(n.midi)
    const end = time + Math.max(0.1, Math.min(n.durationSec, n.kit ? 0.2 : 6))
    this.connectVoice(inst, osc, velocityGain(n.velocity) * 0.25, time, end + 0.3)
    this.voices.at(-1)!.gain.gain.setTargetAtTime(0, end, 0.08)
    osc.start(time)
    osc.stop(end + 0.5)
  }

  // ───────────── mixing ─────────────

  setSectionGain(section: SectionId, gain: number, rampSec: number) {
    this.ramp(this.secGain.get(section)?.gain, gain, rampSec)
  }
  setSectionBrightness(section: SectionId, hz: number, rampSec: number) {
    this.ramp(this.secFilter.get(section)?.frequency, hz, rampSec)
  }
  setMasterGain(gain: number, rampSec: number) {
    this.ramp(this.master?.gain, gain, rampSec)
  }

  private ramp(p: AudioParam | undefined, value: number, rampSec: number) {
    const ctx = this.ctx
    if (!p || !ctx) return
    const now = ctx.currentTime
    p.cancelScheduledValues(now)
    if (rampSec > 0) {
      p.setValueAtTime(p.value, now)
      p.linearRampToValueAtTime(value, now + rampSec)
    } else p.setValueAtTime(value, now)
  }

  silence() {
    this.epoch++
    this.pending = []
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    if (this.gate) {
      this.gate.gain.cancelScheduledValues(now)
      this.gate.gain.setValueAtTime(this.gate.gain.value, now)
      this.gate.gain.linearRampToValueAtTime(0, now + 0.02)
    }
    for (const v of this.voices.splice(0)) this.release(v, now, 0.01)
  }

  unsilence(atSec: number) {
    const ctx = this.ctx
    if (!this.gate || !ctx) return
    const at = Math.max(ctx.currentTime, atSec)
    this.gate.gain.cancelScheduledValues(ctx.currentTime)
    this.gate.gain.setValueAtTime(0, Math.max(ctx.currentTime, at - 0.001))
    this.gate.gain.linearRampToValueAtTime(1, at + 0.04)
  }

  getLevels(): Record<SectionId, number> {
    const out = {} as Record<SectionId, number>
    for (const { id } of SECTIONS) {
      const a = this.secMeter.get(id)
      if (!a) {
        out[id] = 0
        continue
      }
      a.getFloatTimeDomainData(this.meterBuf)
      let sum = 0
      for (let i = 0; i < this.meterBuf.length; i++) sum += this.meterBuf[i] * this.meterBuf[i]
      const rms = Math.sqrt(sum / this.meterBuf.length)
      // dB scale: −54 dB (and below) → 0, 0 dB → 1. Digital silence is exactly 0; quiet playing is still clearly visible.
      out[id] = rms <= 1e-5 ? 0 : Math.max(0, Math.min(1, (20 * Math.log10(rms) + 54) / 54))
    }
    return out
  }

  dispose() {
    this.pending = []
    for (const v of this.voices.splice(0)) {
      try {
        v.src.stop()
      } catch {
        /* ignore */
      }
    }
    for (const n of this.nodes.splice(0).reverse()) {
      try {
        n.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.instBus.clear()
    this.secFilter.clear()
    this.secGain.clear()
    this.secMeter.clear()
    this.buffers.clear()
    this.ready.clear()
    this.master = null
    this.gate = null
    try {
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.ctx = null
  }
}

function filesOf(e: BankEntry): string[] {
  return e.kind === 'sustained' ? e.samples.map((s) => s.file) : e.voices.flatMap((v) => v.layers.map((l) => l.file))
}
