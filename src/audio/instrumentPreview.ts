import { fetchBytesCached } from './sampledBackend'
import { layerIndex, nearestDrum, nearestSample, playbackRate, type SampleManifest } from './sampleBank'
import type { InstrumentId } from './instruments'

/**
 * Plays single notes and scales of ONE instrument from the same recorded samples the Studio uses, for the Orchestra page.
 * Only the files of the instrument being listened to are fetched and decoded; the context is closed with `close()`.
 */

/** Sounding range a recording can honestly cover: the recorded pitches, stretched at most 5 semitones down and 7 up. */
export function playableRange(range: [number, number], roots: readonly number[]): [number, number] {
  const lo = Math.max(range[0], Math.min(...roots) - 5)
  const hi = Math.min(range[1], Math.max(...roots) + 7)
  return lo <= hi ? [lo, hi] : [Math.min(...roots), Math.max(...roots)]
}

/** Notes for "play the whole range": ascending, evenly spaced (at most ~16 notes), always ending on the top note. */
export function rangeNotes(lo: number, hi: number, maxNotes = 16): number[] {
  const step = Math.max(2, Math.ceil((hi - lo) / (maxNotes - 1)))
  const out: number[] = []
  for (let m = lo; m < hi; m += step) out.push(m)
  out.push(hi)
  return out
}

export interface PreviewOptions {
  baseUrl?: string
  contextFactory?: () => AudioContext
  fetchBytes?: (url: string, cacheName: string) => Promise<ArrayBuffer>
}

export class InstrumentPreview {
  private ctx: AudioContext | null = null
  private manifest: SampleManifest | null = null
  private buffers = new Map<string, AudioBuffer>()
  private active: AudioScheduledSourceNode[] = []
  private timers: ReturnType<typeof setTimeout>[] = []
  private token = 0
  private waiters: (() => void)[] = []
  private closed = false
  constructor(private opts: PreviewOptions = {}) {}

  private get base() {
    return this.opts.baseUrl ?? `${import.meta.env.BASE_URL ?? '/'}samples/`
  }

  /** Recorded pitches of an instrument (for the playable range), after the manifest is loaded. */
  async roots(id: InstrumentId): Promise<number[]> {
    const e = (await this.loadManifest()).instruments[id]
    if (!e) return []
    return e.kind === 'sustained' ? e.samples.map((s) => s.root) : e.voices.flatMap((v) => (v.root === null ? [] : [v.root]))
  }

  private async loadManifest(): Promise<SampleManifest> {
    if (this.manifest) return this.manifest
    const res = await fetch(`${this.base}manifest.json`)
    if (!res.ok) throw new Error(`The sample library is not available (HTTP ${res.status}).`)
    this.manifest = (await res.json()) as SampleManifest
    return this.manifest
  }

  private context(): AudioContext {
    if (this.closed) throw new Error('closed')
    if (!this.ctx) {
      const make = this.opts.contextFactory ?? (() => new AudioContext({ latencyHint: 'interactive' }))
      this.ctx = make()
    }
    return this.ctx
  }

  /** Fetch + decode every file of an instrument (cached after the first time). */
  async load(id: InstrumentId): Promise<void> {
    const m = await this.loadManifest()
    const entry = m.instruments[id]
    if (!entry) throw new Error(`No recording of ${id}.`)
    const ctx = this.context()
    const files = entry.kind === 'sustained' ? entry.samples.map((s) => s.file) : entry.voices.flatMap((v) => v.layers.map((l) => l.file))
    const cacheName = `maestro-samples-${m.build ?? m.source.commit.slice(0, 8)}`
    const fetchBytes = this.opts.fetchBytes ?? fetchBytesCached
    await Promise.all(
      files.filter((f) => !this.buffers.has(f)).map(async (f) => {
        const bytes = await fetchBytes(`${this.base}${f}`, cacheName)
        this.buffers.set(f, await ctx.decodeAudioData(bytes))
      }),
    )
  }

  /** Stop whatever is playing now. */
  stop(): void {
    this.token++
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
    for (const w of this.waiters.splice(0)) w() // a stopped sequence's promise must still settle
    for (const s of this.active) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.active = []
  }

  /** Start one note (call `load(id)` first). `velocity` 0–1 chooses the layer of a drum. Returns its length in seconds. */
  note(id: InstrumentId, midi: number, when: number, seconds: number, velocity = 0.7): number {
    const ctx = this.context()
    const entry = this.manifest?.instruments[id]
    if (!entry) return 0
    const out = ctx.createGain()
    out.connect(ctx.destination)
    const src = ctx.createBufferSource()
    let rate = 1
    let tail = 0.3
    if (entry.kind === 'sustained') {
      const s = nearestSample(entry.samples, midi)
      src.buffer = this.buffers.get(s.file) ?? null
      src.loop = true
      src.loopStart = s.loopStart
      src.loopEnd = s.loopEnd
      rate = playbackRate(midi, s.root, s.cents)
      tail = entry.release
      const peak = 0.55
      out.gain.setValueAtTime(0.0001, when)
      out.gain.linearRampToValueAtTime(peak, when + 0.04)
      out.gain.setValueAtTime(peak, when + Math.max(0.05, seconds))
      out.gain.linearRampToValueAtTime(0.0001, when + Math.max(0.05, seconds) + tail)
    } else {
      const v = entry.voices.length > 1 || entry.voices[0].root !== null ? nearestDrum(entry.voices, midi) : entry.voices[0]
      const layer = v.layers[layerIndex(velocity, v.layers.length)]
      src.buffer = this.buffers.get(layer.file) ?? null
      if (v.root !== null) rate = playbackRate(midi, v.root, v.cents)
      seconds = layer.duration
      out.gain.setValueAtTime(0.25 + 0.55 * velocity, when)
    }
    src.playbackRate.value = rate
    src.connect(out)
    src.start(when)
    src.stop(when + seconds + tail)
    this.active.push(src)
    src.onended = () => {
      this.active = this.active.filter((x) => x !== src)
    }
    return seconds + tail
  }

  /**
   * Play notes one after another. `onNote(midi)` is called as each begins and `onNote(null)` at the end. Resolves when finished
   * or stopped. A new call stops the previous one.
   */
  async playSequence(id: InstrumentId, notes: { midi: number; velocity?: number }[], opts: { noteSeconds?: number; gap?: number; onNote?: (midi: number | null) => void } = {}): Promise<void> {
    this.stop()
    const my = this.token
    await this.load(id)
    if (my !== this.token) return
    const ctx = this.context()
    await ctx.resume()
    const len = opts.noteSeconds ?? 0.55
    const gap = opts.gap ?? len * 0.9
    const t0 = ctx.currentTime + 0.05
    notes.forEach((n, i) => {
      this.note(id, n.midi, t0 + i * gap, len, n.velocity)
      this.timers.push(setTimeout(() => my === this.token && opts.onNote?.(n.midi), 50 + i * gap * 1000))
    })
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve)
      this.timers.push(setTimeout(resolve, 50 + notes.length * gap * 1000 + 400))
    })
    if (my === this.token) opts.onNote?.(null)
  }

  close(): void {
    this.stop()
    this.closed = true
    void this.ctx?.close()
    this.ctx = null
    this.buffers.clear()
  }
}
