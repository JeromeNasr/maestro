import type { TimeSignature } from '@/config/gestureConfig'
import { beatsPerBar } from '@/gesture/directions'
import type { ConductingEvent, CueKind, GestureSnapshot } from '@/gesture/types'

export type TempoMode = 'follow' | 'fixed'
export type TransportState = 'stopped' | 'playing' | 'paused' | 'finished'

/** What the conductor controls on the audio side. */
export interface BridgeTarget {
  /** Quarter-note BPM. */
  setTargetBpm(bpm: number): void
  /** 0 (pp) … 1 (ff). */
  setDynamicsLevel(level: number): void
}

export interface BridgeTransport {
  state(): TransportState
  start(): void
  pause(): void
  resume(): void
  stop(): void
}

export interface BridgeOptions {
  /** Quarter notes per conducted beat (2 when a 4/4 piece is conducted "in two", otherwise 1). */
  quartersPerBeat: () => number
  tempoMode: () => TempoMode
  /** Called for every cue the gesture engine fires, with whether it was acted on. */
  onCue?: (cue: CueKind, applied: boolean) => void
}

/**
 * Quarter notes per conducted beat for a written meter conducted in a given pattern:
 *   4/4 in four → 1, 4/4 in two → 2, 3/4 in three → 1, 2/4 in two → 1.
 */
export function quartersPerBeat(written: TimeSignature, pattern: TimeSignature): number {
  const q = beatsPerBar(written)
  const p = beatsPerBar(pattern)
  return q % p === 0 ? q / p : 1
}

/**
 * The conductor bridge: the only place where gesture-engine output is translated into audio commands.
 *  - tempo events → target tempo (when following; ignored in fixed-tempo mode). The audio engine glides to it.
 *  - dynamics → continuous level every frame (the engine ignores negligible changes).
 *  - cues → transport commands, VALIDATED against the current transport state so a stray or repeated cue is harmless.
 * It never reaches into the gesture engine or the DOM, and the audio engine never sees landmarks.
 */
export class ConductorBridge {
  constructor(private target: BridgeTarget, private transport: BridgeTransport, private opts: BridgeOptions) {}

  handle(events: readonly ConductingEvent[], snapshot: GestureSnapshot) {
    for (const e of events) {
      if (e.type === 'tempo' && this.opts.tempoMode() === 'follow') this.target.setTargetBpm(e.bpm * this.opts.quartersPerBeat())
      else if (e.type === 'cue') this.cue(e.cue)
    }
    this.target.setDynamicsLevel(snapshot.dynamics.level)
  }

  private cue(cue: CueKind) {
    const s = this.transport.state()
    let applied = false
    if (cue === 'start' && (s === 'stopped' || s === 'finished')) {
      this.transport.start()
      applied = true
    } else if (cue === 'pause' && s === 'playing') {
      this.transport.pause()
      applied = true
    } else if (cue === 'resume' && s === 'paused') {
      this.transport.resume()
      applied = true
    } else if (cue === 'stop' && (s === 'playing' || s === 'paused')) {
      this.transport.stop()
      applied = true
    }
    this.opts.onCue?.(cue, applied)
  }
}
