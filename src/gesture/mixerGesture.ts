import type { DynamicsConfig, MixerGestureConfig } from '@/config/gestureConfig'
import { SECTIONS, type SectionId } from '@/orchestra/sections'
import type { TrackedHand } from '@/vision/types'
import { readFingerPose } from './fingerPose'
import { handLevel, type VerticalRange } from './handLevel'
import type { MixerEvent, MixerReading } from './types'

export const IDLE_MIXER: MixerReading = { section: null, candidate: null, progress: 0, volume: 0, fingers: null }

/** How far the hand must move after grabbing before the volume starts to follow it (0–1 of the hand's range). */
const ENGAGE_DISTANCE = 0.1
/** A hand that has been out of view this long lets go of the section on its own (ms). */
const LOST_RELEASE_MS = 1200
/** After letting go, the same hand cannot grab again for this long (ms), so the fist that released is not read as a pose. */
const COOLDOWN_MS = 600

/**
 * The finger mixer, a small state machine for the LEFT hand:
 *
 *   idle ──(1–4 fingers up, thumb tucked, hand still, held ~0.7 s)──▶ grabbed(section)
 *   grabbed ──(hand height)──▶ the section's volume, edge to edge: top = full, bottom = off
 *   grabbed ──(fist held ~0.4 s, or the hand leaves view for ~1 s)──▶ idle
 *
 * 1 finger = strings, 2 = woodwinds, 3 = brass, 4 = percussion (the order of the Orchestra panel). While a section is in the
 * hand the engine freezes ordinary dynamics and cues, so one hand has one job at a time. Showing a different number of
 * fingers for a moment switches to that section. It never decides anything from a single frame: every step needs a hold.
 */
export class MixerGesture {
  private grabbed: SectionId | null = null
  private cand: { section: SectionId; since: number } | null = null
  private fistSince: number | null = null
  private lastSeenMs = 0
  private lastT: number | null = null
  private vol = 0.5
  private lastEmitted = -1
  private engaged = false
  private grabLevel = 0
  private cooldownUntil = 0
  private _reading: MixerReading = IDLE_MIXER
  private holdMs = 700

  get reading(): MixerReading {
    return this._reading
  }
  /** True while a section is in the hand or a pose is being held towards grabbing one (the engine then ignores dynamics and cues). */
  get busy(): boolean {
    return this.grabbed !== null || this.cand !== null
  }
  get held(): SectionId | null {
    return this.grabbed
  }

  reset() {
    this.grabbed = null
    this.cand = null
    this.fistSince = null
    this.lastT = null
    this.lastEmitted = -1
    this.engaged = false
    this._reading = IDLE_MIXER
  }

  update(hand: TrackedHand | null, tMs: number, range: VerticalRange | null, aspect: number, cfg: MixerGestureConfig, dyn: Pick<DynamicsConfig, 'fallbackHighY' | 'fallbackLowY'>): MixerEvent[] {
    const events: MixerEvent[] = []
    this.holdMs = cfg.holdMs
    const dt = this.lastT === null ? 0 : Math.max(0, tMs - this.lastT)
    this.lastT = tMs
    const emit = (phase: MixerEvent['phase'], section: SectionId, volume = this.snapped()) => events.push({ type: 'mixer', timestampMs: tMs, phase, section, volume })
    const release = () => {
      if (this.grabbed) emit('release', this.grabbed)
      this.grabbed = null
      this.fistSince = null
      this.cand = null
      this.engaged = false
      this.lastEmitted = -1
      this.cooldownUntil = tMs + COOLDOWN_MS
    }

    if (!cfg.enabled) {
      if (this.grabbed) release()
      this._reading = IDLE_MIXER
      return events
    }
    const tracking = hand?.status === 'tracking'
    if (!hand || !tracking) {
      this.cand = null
      if (this.grabbed && tMs - this.lastSeenMs > LOST_RELEASE_MS) release()
      this.publish(null)
      return events
    }
    this.lastSeenMs = tMs

    const pose = readFingerPose(hand.landmarks, aspect, cfg)
    const handSize = Math.max(0.03, hand.handSize)
    const still = hand.kinematics.speed / handSize < cfg.stillSpeed
    const shown: SectionId | null = pose && pose.thumbTucked && pose.count >= 1 ? SECTIONS[Math.min(4, pose.count) - 1].id : null
    const fist = !!pose && pose.thumbTucked && pose.count === 0
    const raw = handLevel(hand.palm.y, range, dyn)

    // 1) grabbing (or switching to another section): a finger pose, held still.
    if (shown && still && tMs >= this.cooldownUntil && shown !== this.grabbed) {
      if (this.cand?.section !== shown) this.cand = { section: shown, since: tMs }
      const need = this.grabbed ? cfg.holdMs * 0.7 : cfg.holdMs
      if (tMs - this.cand.since >= need) {
        if (this.grabbed) emit('release', this.grabbed)
        this.grabbed = shown
        this.cand = null
        this.fistSince = null
        this.engaged = false
        this.grabLevel = raw
        this.vol = this.edgeMap(raw, cfg)
        this.lastEmitted = -1
        emit('grab', shown)
      }
    } else if (!shown || !still) {
      this.cand = null
    }

    // 2) holding a section: height → volume; a fist lets go.
    if (this.grabbed) {
      const target = this.edgeMap(raw, cfg)
      if (!this.engaged && Math.abs(raw - this.grabLevel) >= ENGAGE_DISTANCE) this.engaged = true
      if (this.engaged) {
        const a = 1 - Math.exp(-dt / Math.max(1, cfg.smoothingMs))
        this.vol += a * (target - this.vol)
        if (Math.abs(this.snapped() - this.lastEmitted) >= 0.015 || this.lastEmitted < 0 || (this.snapped() !== this.lastEmitted && (this.snapped() === 0 || this.snapped() === 1))) {
          this.lastEmitted = this.snapped()
          emit('level', this.grabbed)
        }
      }
      if (fist) {
        this.fistSince ??= tMs
        if (tMs - this.fistSince >= cfg.releaseMs) release()
      } else this.fistSince = null
    }
    this.publish(pose ? pose.count : null, shown !== null && pose?.thumbTucked === true)
    return events
  }

  /** Hand height 0…1 → volume 0…1, with a dead band at each end so "all the way down" is a real off and "up" a real full. */
  private edgeMap(level: number, cfg: MixerGestureConfig): number {
    const e = Math.min(0.3, Math.max(0, cfg.edgeLevel))
    return Math.max(0, Math.min(1, (level - e) / (1 - 2 * e)))
  }

  /** The smoothed volume, with the last hair's breadth at each end taken as exactly off / exactly full. */
  private snapped(): number {
    return this.vol < 0.012 ? 0 : this.vol > 0.988 ? 1 : this.vol
  }

  private publish(fingers: number | null, poseOk = false) {
    const c = this.cand
    this._reading = {
      section: this.grabbed,
      candidate: c?.section ?? null,
      progress: c ? Math.min(1, Math.max(0, (this.lastT ?? 0) - c.since) / (this.grabbed ? this.holdMs * 0.7 : this.holdMs)) : 0,
      volume: this.snapped(),
      fingers: poseOk ? fingers : null,
    }
  }
}
