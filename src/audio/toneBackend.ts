import * as Tone from 'tone'
import { SECTIONS, type SectionId } from '@/orchestra/sections'
import type { AudioBackend, BackendInfo } from './backend'
import { midiToHz } from './pitch'
import type { ScheduledNote } from './sequencer'

/** Notes are only handed to Web Audio this far ahead of their time, so `silence()` can still cancel the rest. */
const FLUSH_AHEAD_S = 0.07

interface Pending { n: ScheduledNote; epoch: number }

/** A section's voice: knows how to sound one note. */
interface Voice {
  play(n: ScheduledNote, hz: number, time: number): void
  releaseAll(time: number): void
  dispose(): void
}

type Disposable = { dispose(): unknown }

/** The part of Tone.PolySynth we use (it is generic over the voice type). */
interface PolyLike extends Disposable {
  maxPolyphony: number
  connect(n: Tone.ToneAudioNode): unknown
  triggerAttackRelease(hz: number, durationSec: number, time: number, velocity: number): unknown
  releaseAll(time: number): unknown
}

function poly(synth: PolyLike, out: Tone.ToneAudioNode, maxPolyphony: number): Voice {
  synth.maxPolyphony = maxPolyphony
  synth.connect(out)
  return {
    play: (n, hz, time) => synth.triggerAttackRelease(hz, n.durationSec, time, n.velocity),
    releaseAll: (t) => synth.releaseAll(t),
    dispose: () => synth.dispose(),
  }
}

/**
 * Real Web Audio implementation (Tone.js). Four sections with deliberately different sound sources:
 *   strings     detuned-sawtooth ensemble, slow bowed attack, gentle vibrato
 *   woodwinds   FM (sine carrier, triangle modulator) — pure, breathy, slightly delayed vibrato-free colour
 *   brass       sawtooth through a swelling low-pass filter envelope — the "blare" opens as the note speaks
 *   percussion  pitched timpani (membrane synth) + a noise-based kit (snare, cymbal, bass drum) for drum-channel notes
 */
export class ToneBackend implements AudioBackend {
  info: BackendInfo = { kind: 'tone' }
  private ctx: Tone.Context | null = null
  private nodes: Disposable[] = []
  private voices = new Map<SectionId, Voice>()
  private kit: { kick: Tone.MembraneSynth; snare: Tone.NoiseSynth; cymbal: Tone.NoiseSynth; tick: Tone.NoiseSynth } | null = null
  private filters = new Map<SectionId, Tone.Filter>()
  private gains = new Map<SectionId, Tone.Gain>()
  private meters = new Map<SectionId, Tone.Meter>()
  private master: Tone.Gain | null = null
  private gate: Tone.Gain | null = null
  private pending: Pending[] = []
  private epoch = 0

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  async init(): Promise<void> {
    if (typeof AudioContext === 'undefined' && typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext === 'undefined') {
      throw new Error('This browser does not support the Web Audio API.')
    }
    const ctx = new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.03 })
    this.ctx = ctx
    Tone.setContext(ctx)
    try {
      await ctx.resume() // must follow a user gesture, otherwise the browser leaves it suspended
    } catch (e) {
      throw new Error(`The browser blocked audio (${e instanceof Error ? e.message : 'autoplay policy'}). Click Start again.`, { cause: e })
    }
    if (ctx.state !== 'running') throw new Error('The audio context did not start. Click Start again.')
    await this.build(ctx)
    this.info = { kind: 'tone', sampleRate: ctx.sampleRate, baseLatencySec: (ctx.rawContext as AudioContext).baseLatency, contextState: ctx.state }
  }

  private track<T extends Disposable>(n: T): T {
    this.nodes.push(n)
    return n
  }

  private async build(ctx: Tone.Context) {
    const limiter = this.track(new Tone.Limiter(-1).toDestination())
    this.gate = this.track(new Tone.Gain(1).connect(limiter))
    this.master = this.track(new Tone.Gain(0.8).connect(this.gate))
    const reverb = this.track(new Tone.Reverb({ decay: 2.4, preDelay: 0.02, wet: 1 }))
    await reverb.ready
    const reverbReturn = this.track(new Tone.Gain(0.22))
    reverb.connect(reverbReturn)
    reverbReturn.connect(this.master)

    for (const { id } of SECTIONS) {
      const filter = this.track(new Tone.Filter({ type: 'lowpass', frequency: 4000, Q: 0.5, rolloff: -12 }))
      const gain = this.track(new Tone.Gain(0))
      const meter = this.track(new Tone.Meter({ normalRange: true, smoothing: 0.55 }))
      const send = this.track(new Tone.Gain(0.55))
      filter.connect(gain)
      gain.connect(this.master)
      gain.connect(meter)
      gain.connect(send)
      send.connect(reverb)
      this.filters.set(id, filter)
      this.gains.set(id, gain)
      this.meters.set(id, meter)
      this.voices.set(id, this.makeVoice(id, filter))
    }
    void ctx
  }

  private makeVoice(id: SectionId, out: Tone.ToneAudioNode): Voice {
    switch (id) {
      case 'strings': {
        const vib = this.track(new Tone.Vibrato({ frequency: 5.2, depth: 0.07, type: 'sine' }))
        vib.connect(out)
        const synth = this.track(
          new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 22 }, envelope: { attack: 0.14, decay: 0.25, sustain: 0.82, release: 0.75 }, volume: -12 }),
        )
        return poly(synth, vib, 28)
      }
      case 'woodwinds': {
        const synth = this.track(
          new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 1.005, modulationIndex: 0.9, oscillator: { type: 'sine' }, modulation: { type: 'triangle' },
            envelope: { attack: 0.07, decay: 0.12, sustain: 0.88, release: 0.28 },
            modulationEnvelope: { attack: 0.12, decay: 0.2, sustain: 0.35, release: 0.25 }, volume: -8,
          }),
        )
        return poly(synth, out, 14)
      }
      case 'brass': {
        const synth = this.track(
          new Tone.PolySynth(Tone.MonoSynth, {
            oscillator: { type: 'sawtooth' }, envelope: { attack: 0.07, decay: 0.3, sustain: 0.72, release: 0.4 },
            filter: { Q: 1.6, type: 'lowpass', rolloff: -24 },
            filterEnvelope: { attack: 0.09, decay: 0.25, sustain: 0.55, release: 0.45, baseFrequency: 320, octaves: 3.3 }, volume: -11,
          }),
        )
        return poly(synth, out, 14)
      }
      case 'percussion': {
        const timpani = this.track(
          new Tone.PolySynth(Tone.MembraneSynth, { pitchDecay: 0.09, octaves: 2.2, oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.8, sustain: 0, release: 1.0 }, volume: -6 }),
        )
        timpani.maxPolyphony = 6
        timpani.connect(out)
        const kick = this.track(new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 5, envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.2 }, volume: -4 }))
        kick.connect(out)
        const snare = this.track(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.17, sustain: 0, release: 0.05 }, volume: -12 }))
        const cymbal = this.track(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.7, sustain: 0, release: 1.2 }, volume: -20 }))
        const tick = this.track(new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }, volume: -20 }))
        const hp = this.track(new Tone.Filter({ type: 'highpass', frequency: 4500 }))
        cymbal.connect(hp)
        tick.connect(hp)
        hp.connect(out)
        snare.connect(out)
        this.kit = { kick, snare, cymbal, tick }
        return {
          play: (n, hz, time) => {
            if (n.kit) this.playKit(n, time)
            else timpani.triggerAttackRelease(hz, Math.max(0.25, n.durationSec), time, n.velocity)
          },
          releaseAll: (t) => {
            timpani.releaseAll(t)
            for (const s of [snare, cymbal, tick]) s.triggerRelease(t)
          },
          dispose: () => timpani.dispose(),
        }
      }
    }
  }

  /** General MIDI drum-kit notes → drum voices. */
  private playKit(n: ScheduledNote, time: number) {
    const k = this.kit
    if (!k) return
    const v = n.velocity
    if (n.midi === 35 || n.midi === 36) k.kick.triggerAttackRelease('C1', 0.25, time, v)
    else if (n.midi === 38 || n.midi === 40 || n.midi === 39) k.snare.triggerAttackRelease(0.15, time, v)
    else if (n.midi === 49 || n.midi === 57 || n.midi === 51 || n.midi === 52 || n.midi === 55) k.cymbal.triggerAttackRelease(1.6, time, v)
    else k.tick.triggerAttackRelease(0.05, time, v) // hats, triangle, blocks, anything else: a light tick
  }

  scheduleNote(n: ScheduledNote) {
    this.pending.push({ n, epoch: this.epoch })
  }

  pump() {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    // `pending` is nearly sorted; sounding anything due within the flush window keeps the cancel window short.
    const keep: Pending[] = []
    for (const p of this.pending) {
      if (p.epoch !== this.epoch) continue
      if (p.n.timeSec - now <= FLUSH_AHEAD_S) this.sound(p.n, Math.max(p.n.timeSec, now))
      else keep.push(p)
    }
    this.pending = keep
  }

  private sound(n: ScheduledNote, time: number) {
    const voice = this.voices.get(n.section)
    if (!voice) return
    try {
      voice.play(n, midiToHz(n.midi), time)
    } catch {
      /* a single voice failing (e.g. polyphony exhausted) must not stop the music */
    }
  }

  setSectionGain(section: SectionId, gain: number, rampSec: number) {
    const g = this.gains.get(section)
    if (!g) return
    if (rampSec > 0) g.gain.rampTo(gain, rampSec)
    else g.gain.value = gain
  }
  setSectionBrightness(section: SectionId, hz: number, rampSec: number) {
    const f = this.filters.get(section)
    if (!f) return
    if (rampSec > 0) f.frequency.rampTo(hz, rampSec)
    else f.frequency.value = hz
  }
  setMasterGain(gain: number, rampSec: number) {
    if (!this.master) return
    if (rampSec > 0) this.master.gain.rampTo(gain, rampSec)
    else this.master.gain.value = gain
  }

  silence() {
    this.epoch++
    this.pending = []
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (this.gate) {
      this.gate.gain.cancelScheduledValues(now)
      this.gate.gain.rampTo(0, 0.02)
    }
    for (const v of this.voices.values()) {
      try {
        v.releaseAll(now)
      } catch {
        /* ignore */
      }
    }
  }

  unsilence(atSec: number) {
    if (!this.gate || !this.ctx) return
    this.gate.gain.cancelScheduledValues(this.ctx.currentTime)
    this.gate.gain.setValueAtTime(0, Math.max(this.ctx.currentTime, atSec - 0.001))
    this.gate.gain.rampTo(1, 0.04, Math.max(this.ctx.currentTime, atSec))
  }

  getLevels(): Record<SectionId, number> {
    const out = {} as Record<SectionId, number>
    for (const { id } of SECTIONS) {
      const v = this.meters.get(id)?.getValue()
      const x = typeof v === 'number' ? v : Array.isArray(v) ? Math.max(...v) : 0
      out[id] = Math.max(0, Math.min(1, x * 3))
    }
    return out
  }

  dispose() {
    this.pending = []
    for (const n of this.nodes.splice(0).reverse()) {
      try {
        n.dispose()
      } catch {
        /* ignore */
      }
    }
    this.voices.clear()
    this.filters.clear()
    this.gains.clear()
    this.meters.clear()
    this.kit = null
    this.master = null
    this.gate = null
    try {
      void this.ctx?.dispose()
    } catch {
      /* ignore */
    }
    this.ctx = null
  }
}
