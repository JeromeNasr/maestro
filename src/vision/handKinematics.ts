import type { HandKinematicsState, Vec2 } from './types'

const STILL: HandKinematicsState = { velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, speed: 0, direction: null }

export interface KinematicsOptions {
  /** Velocity smoothing time constant (s). */
  velocityTau: number
  accelerationTau: number
  /** Below this speed (units/s) the hand is "still" and has no direction. */
  minSpeed: number
  /** A gap longer than this (s) restarts estimation instead of producing a huge velocity. */
  maxGapSec: number
}

const DEFAULTS: KinematicsOptions = { velocityTau: 0.04, accelerationTau: 0.08, minSpeed: 0.05, maxGapSec: 0.25 }

/** Estimates velocity, acceleration and direction of travel for one hand's palm. */
export class HandKinematics {
  private prev: Vec2 | null = null
  private prevT = 0
  private vel: Vec2 = { x: 0, y: 0 }
  private acc: Vec2 = { x: 0, y: 0 }
  private opts: KinematicsOptions

  constructor(opts: Partial<KinematicsOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts }
  }

  update(p: Vec2, tMs: number): HandKinematicsState {
    const t = tMs / 1000
    if (!this.prev || t - this.prevT <= 0 || t - this.prevT > this.opts.maxGapSec) {
      this.prev = p
      this.prevT = t
      this.vel = { x: 0, y: 0 }
      this.acc = { x: 0, y: 0 }
      return STILL
    }
    const dt = t - this.prevT
    const rawV = { x: (p.x - this.prev.x) / dt, y: (p.y - this.prev.y) / dt }
    const aV = 1 - Math.exp(-dt / this.opts.velocityTau)
    const newV = { x: this.vel.x + aV * (rawV.x - this.vel.x), y: this.vel.y + aV * (rawV.y - this.vel.y) }
    const rawA = { x: (newV.x - this.vel.x) / dt, y: (newV.y - this.vel.y) / dt }
    const aA = 1 - Math.exp(-dt / this.opts.accelerationTau)
    this.acc = { x: this.acc.x + aA * (rawA.x - this.acc.x), y: this.acc.y + aA * (rawA.y - this.acc.y) }
    this.vel = newV
    this.prev = p
    this.prevT = t
    const speed = Math.hypot(newV.x, newV.y)
    return {
      velocity: { ...newV },
      acceleration: { ...this.acc },
      speed,
      direction: speed >= this.opts.minSpeed ? Math.atan2(newV.y, newV.x) : null,
    }
  }

  reset() {
    this.prev = null
    this.vel = { x: 0, y: 0 }
    this.acc = { x: 0, y: 0 }
  }
}
