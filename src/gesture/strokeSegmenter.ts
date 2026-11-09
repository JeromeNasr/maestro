import type { V2 } from './directions'
import { angleBetweenDeg, dot, norm, sub, unit } from './directions'

/**
 * Splits the right palm's trajectory into STROKES and finds the ictus (the point where a stroke ends and the beat is
 * felt). It looks at velocity and direction over time, never at absolute screen position:
 *  - a stroke starts when speed rises above `startSpeed`;
 *  - it ends at a CORNER (direction changes by more than `turnAngleDeg` while still moving — continuous patterns) or
 *    when speed falls below `endRatio` × the stroke's peak speed (a stop/bounce);
 *  - the ictus is the point of greatest progress along the stroke direction, not the moment of detection.
 * Units: distances in hand sizes, speeds in hand sizes per second, times in ms.
 */
export interface SegmenterSample {
  tMs: number
  pos: V2
  vel: V2
}

export interface SegmenterParams {
  startSpeed: number
  endRatio: number
  turnAngleDeg: number
  maxStrokeMs: number
}

export interface StrokeCandidate {
  startMs: number
  ictusMs: number
  detectedMs: number
  /** Unit vector of the net movement start → ictus. */
  vector: V2
  /** Length of that movement, hand sizes. */
  amplitude: number
  peakSpeed: number
  durationMs: number
  endedBy: 'corner' | 'stop' | 'timeout'
}

interface Active {
  /** True once the stroke has moved far enough for `dir` to be fixed to its initial heading. */
  locked: boolean
  startPos: V2
  startMs: number
  dir: V2
  peak: number
  maxProj: number
  maxPos: V2
  maxMs: number
  /** First moment the heading began to diverge from `dir` (start of a corner); reset if it swings back. */
  onset: { pos: V2; ms: number } | null
  /** Progress along the heading at each sample, so the ictus time can be interpolated between frames. */
  trace: { t: number; p: number }[]
}

const MIN_DIR_DISTANCE = 0.3 // hand sizes of travel after which the stroke's reference direction is fixed
const MIN_CORNER_DISTANCE = 0.4

export class StrokeSegmenter {
  private s: Active | null = null
  /** After a stroke ends, speed must dip below the start threshold before another can begin (ignores the deceleration tail). */
  private armed = true
  private valley = Infinity

  constructor(private p: SegmenterParams) {}

  setParams(p: SegmenterParams) {
    this.p = p
  }

  get active(): boolean {
    return this.s !== null
  }

  abort() {
    this.s = null
    this.armed = true
  }

  update(sample: SegmenterSample): StrokeCandidate | null {
    const speed = norm(sample.vel)
    if (!this.s) {
      if (!this.armed) {
        // A new stroke is a dip followed by re-acceleration; a monotonically falling speed is just the previous stroke's tail.
        this.valley = Math.min(this.valley, speed)
        if (speed < this.p.startSpeed || speed > this.valley * 1.3 + 0.2) this.armed = true
      }
      if (this.armed && speed >= this.p.startSpeed) this.begin(sample.pos, sample.tMs, unit(sample.vel), speed)
      return null
    }
    const st = this.s
    st.peak = Math.max(st.peak, speed)
    const disp = sub(sample.pos, st.startPos)
    const dist = norm(disp)
    // The reference heading is fixed early (not continuously updated from net displacement), otherwise the chord would
    // rotate together with a corner and hide it.
    if (!st.locked && dist >= MIN_DIR_DISTANCE) {
      st.dir = unit(disp)
      st.locked = true
    }
    const proj = dot(disp, st.dir)
    if (st.trace.length < 400) st.trace.push({ t: sample.tMs, p: proj })
    if (proj > st.maxProj) {
      st.maxProj = proj
      st.maxPos = sample.pos
      st.maxMs = sample.tMs
    }

    if (st.locked && speed >= 0.6 * this.p.startSpeed) {
      const ang = angleBetweenDeg(sample.vel, st.dir)
      if (ang > this.p.turnAngleDeg * 0.5) st.onset ??= { pos: sample.pos, ms: sample.tMs }
      else if (ang < this.p.turnAngleDeg * 0.3) st.onset = null
    }
    // Corner: still moving quickly but heading somewhere clearly different → the previous stroke ended at its extreme point.
    if (speed >= 0.6 * this.p.startSpeed && dist >= MIN_CORNER_DISTANCE && angleBetweenDeg(sample.vel, st.dir) > this.p.turnAngleDeg) {
      // The ictus of a corner is where the turn BEGAN (progress along the old heading stops being meaningful once the
      // new heading is nearly perpendicular, as in the 3/4 pattern).
      if (st.onset) {
        st.maxPos = st.onset.pos
        st.maxMs = st.onset.ms
      }
      const done = this.finish(sample.tMs, 'corner', !st.onset)
      this.begin(done.ictusPos, done.candidate.ictusMs, unit(sample.vel), speed)
      return done.candidate
    }
    // Stop / bounce: speed has collapsed relative to this stroke's peak.
    if (speed < this.p.endRatio * st.peak) {
      const done = this.finish(sample.tMs, 'stop')
      this.armed = speed < this.p.startSpeed
      this.valley = speed
      return done.candidate
    }
    // Too long to be one stroke.
    if (sample.tMs - st.startMs > this.p.maxStrokeMs) {
      const done = this.finish(sample.tMs, 'timeout')
      if (speed >= this.p.startSpeed) this.begin(sample.pos, sample.tMs, unit(sample.vel), speed)
      else {
        this.armed = true
      }
      return done.candidate
    }
    return null
  }

  private begin(pos: V2, tMs: number, dir: V2, speed: number) {
    this.s = { locked: false, startPos: pos, startMs: tMs, dir, peak: speed, maxProj: 0, maxPos: pos, maxMs: tMs, onset: null, trace: [] }
  }

  /**
   * The ictus is only known to the frame it falls on (a 33–90 ms grid), which would quantise every beat interval. The three
   * samples around the peak of progress give a parabola whose vertex is the ictus to a fraction of a frame.
   */
  private refineMs(st: Active): number {
    const i = st.trace.findIndex((x) => x.t === st.maxMs)
    if (i <= 0 || i >= st.trace.length - 1) return st.maxMs
    const a = st.trace[i - 1]
    const b = st.trace[i]
    const c = st.trace[i + 1]
    const denom = a.p - 2 * b.p + c.p
    if (denom >= -1e-9) return st.maxMs // not a clear peak
    const delta = Math.max(-0.5, Math.min(0.5, (0.5 * (a.p - c.p)) / denom))
    return b.t + delta * (delta >= 0 ? c.t - b.t : b.t - a.t)
  }

  private finish(detectedMs: number, endedBy: StrokeCandidate['endedBy'], refine = true) {
    const st = this.s!
    if (refine) st.maxMs = this.refineMs(st)
    this.s = null
    const d = sub(st.maxPos, st.startPos)
    return {
      ictusPos: st.maxPos,
      candidate: {
        startMs: st.startMs,
        ictusMs: st.maxMs,
        detectedMs,
        vector: unit(d),
        amplitude: norm(d),
        peakSpeed: st.peak,
        durationMs: st.maxMs - st.startMs,
        endedBy,
      } satisfies StrokeCandidate,
    }
  }
}
