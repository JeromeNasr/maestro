/**
 * One-Euro filter (Casiez et al., 2012): low-pass filter whose cutoff rises with signal speed,
 * so it removes jitter on slow movement while adding little lag on fast movement.
 * Time is in seconds.
 */
const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuroFilter {
  private x: number | null = null
  private dx = 0
  private t = 0

  constructor(public minCutoff = 1, public beta = 0, public dCutoff = 1) {}

  filter(value: number, tSec: number): number {
    if (this.x === null) {
      this.x = value
      this.t = tSec
      return value
    }
    const dt = tSec - this.t
    if (dt <= 0) return this.x
    const rawDx = (value - this.x) / dt
    const aD = alpha(this.dCutoff, dt)
    this.dx = aD * rawDx + (1 - aD) * this.dx
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    const a = alpha(cutoff, dt)
    this.x = a * value + (1 - a) * this.x
    this.t = tSec
    return this.x
  }

  reset() {
    this.x = null
    this.dx = 0
  }
}
