import type { LabelSource, ReportedLabel, Side, Vec2 } from './types'
import type { HandednessResolution } from './handedness'

/**
 * Hand identity: which detection is the user's LEFT hand and which is the RIGHT.
 *
 * Why not just trust MediaPipe's label? Three real-world problems:
 *  1. The detector is given the raw (un-mirrored) frame, and MediaPipe assumes a mirrored one, so its labels are
 *     inverted unless corrected (see handedness.ts). A wrong default sends the right hand to the dynamics slot.
 *  2. The label of a single hand flickers from frame to frame (especially with a fist, a hand edge-on, poor light).
 *  3. When hands cross, labels are unreliable and position says the opposite of identity.
 *
 * So identity is a TRACK, not a per-frame label. A track is created when a hand appears (side decided from the label
 * evidence fused with position, and by elimination if the other hand is already known) and is then followed by
 * motion continuity: predicted palm position + hand size. The label only nudges a running vote, and can re-assign a
 * track only after sustained, position-consistent contradiction. It also learns the label→side mapping online
 * (two well-separated hands, not crossing) so an uncalibrated camera/browser with different behaviour self-corrects.
 */
export interface IdentityCandidate {
  label: ReportedLabel
  score: number
  /** Palm centre, display space. */
  palm: Vec2
  /** Wrist → middle-base distance (display units). */
  size: number
}

export interface IdentityAssignment<T extends IdentityCandidate> {
  left: { candidate: T; source: LabelSource } | null
  right: { candidate: T; source: LabelSource } | null
}

export interface IdentityOptions {
  /** A track survives this long without a matching detection (ms): edge exits, occlusion, hand crossing. */
  memoryMs: number
  /** Frames of consistent contradicting label evidence before an established track changes side. */
  relabelFrames: number
  /** Two-hand frames of evidence before the label→side mapping is flipped automatically. */
  learnFrames: number
  /** Palm distance (display units) above which two hands count as "well separated" for learning. */
  learnSeparation: number
  /** Aspect (width/height) to compare x and y in the same units. */
  aspect: number
}

export const DEFAULT_IDENTITY_OPTIONS: IdentityOptions = { memoryMs: 900, relabelFrames: 10, learnFrames: 24, learnSeparation: 0.28, aspect: 4 / 3 }

interface Track {
  side: Side
  palm: Vec2
  vel: Vec2
  size: number
  lastMs: number
  /** Running label evidence: -1 = confidently Left, +1 = confidently Right (after the swap). */
  vote: number
  contradict: number
}

const labelEvidence = (c: IdentityCandidate, swap: boolean): number => {
  const sign = (c.label === 'Right') !== swap ? 1 : -1
  return sign * Math.max(0.25, Math.min(1, c.score))
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const sideOfSign = (v: number): Side => (v >= 0 ? 'right' : 'left')

export class HandIdentityTracker {
  private tracks: Record<Side, Track | null> = { left: null, right: null }
  private opts: IdentityOptions
  /** Learned correction on top of the configured swap (only used while handedness is unverified). */
  private learnedFlip = false
  private learn = { agree: 0, disagree: 0 }

  constructor(opts: Partial<IdentityOptions> = {}) {
    this.opts = { ...DEFAULT_IDENTITY_OPTIONS, ...opts }
  }

  setAspect(a: number) {
    if (a > 0.2 && a < 5) this.opts.aspect = a
  }
  /** True once the online learner flipped the unverified mapping. */
  get learnedSwap(): boolean {
    return this.learnedFlip
  }
  reset() {
    this.tracks = { left: null, right: null }
    this.learn = { agree: 0, disagree: 0 }
  }
  /** Forget the learned flip (e.g. after calibration or an explicit user choice). */
  resetLearning() {
    this.learnedFlip = false
    this.learn = { agree: 0, disagree: 0 }
  }

  private dist(a: Vec2, b: Vec2): number {
    return Math.hypot((a.x - b.x) * this.opts.aspect, a.y - b.y)
  }

  assign<T extends IdentityCandidate>(all: readonly T[], res: HandednessResolution, nowMs: number): IdentityAssignment<T> {
    const swap = res.verified ? res.swap : res.swap !== this.learnedFlip
    const cands = [...all].sort((a, b) => b.score - a.score).slice(0, 2)
    // Drop tracks that have been gone too long.
    for (const s of ['left', 'right'] as const) {
      const t = this.tracks[s]
      if (t && nowMs - t.lastMs > this.opts.memoryMs) this.tracks[s] = null
    }
    const out: IdentityAssignment<T> = { left: null, right: null }
    if (cands.length === 0) return out

    // 1. Match candidates to existing tracks by predicted position (+ a label tiebreak).
    const matched = this.match(cands, swap, nowMs)
    const used = new Set<number>()
    for (const [side, ci] of Object.entries(matched) as [Side, number][]) {
      const c = cands[ci]
      this.update(side, c, swap, nowMs)
      out[side] = { candidate: c, source: 'tracked' }
      used.add(ci)
    }
    // 2. Unmatched candidates start new tracks.
    const fresh = cands.map((c, i) => ({ c, i })).filter((x) => !used.has(x.i))
    for (const { c } of fresh) {
      const free: Side[] = (['left', 'right'] as const).filter((s) => !out[s])
      if (free.length === 0) break
      let side: Side
      let source: LabelSource = swap ? 'swapped' : 'reported'
      const other = out.left ?? out.right
      if (free.length === 1) {
        side = free[0] // the other hand is known: by elimination
        if (!other) source = 'positional'
      } else if (cands.length === 2 && fresh.length === 2) {
        side = this.pairSide(fresh[0].c, fresh[1].c, swap) === 'first-right' ? (c === fresh[0].c ? 'right' : 'left') : c === fresh[0].c ? 'left' : 'right'
        source = labelEvidence(fresh[0].c, swap) * labelEvidence(fresh[1].c, swap) < 0 ? source : 'positional'
      } else {
        // A lone hand: position in the mirrored preview is a strong prior (a conductor's right hand lives on the right),
        // the label decides when the hand is near the middle.
        const ev = labelEvidence(c, swap) * (0.4 + 0.6 * c.score) * 0.6 + clamp((c.palm.x - 0.5) * 4, -1, 1) * 0.9
        side = sideOfSign(ev)
      }
      this.tracks[side] = { side, palm: c.palm, vel: { x: 0, y: 0 }, size: c.size, lastMs: nowMs, vote: labelEvidence(c, swap), contradict: 0 }
      out[side] = { candidate: c, source }
    }
    this.maybeLearn(out, res, nowMs)
    return out
  }

  /** Both hands new: do the two labels disagree (use them) or not (use position)? */
  private pairSide(a: IdentityCandidate, b: IdentityCandidate, swap: boolean): 'first-right' | 'first-left' {
    const ea = labelEvidence(a, swap)
    const eb = labelEvidence(b, swap)
    const positional = a.palm.x >= b.palm.x ? 'first-right' : 'first-left'
    if (Math.sign(ea) === Math.sign(eb)) return positional // same label twice: a labelling error, use position
    const byLabel = ea > 0 ? 'first-right' : 'first-left'
    if (byLabel === positional) return byLabel
    // Labels and positions disagree: crossed hands are rare at first sight; only trust labels when both are confident.
    return Math.min(Math.abs(ea), Math.abs(eb)) >= 0.85 && this.dist(a.palm, b.palm) < 0.5 ? byLabel : positional
  }

  private match<T extends IdentityCandidate>(cands: readonly T[], swap: boolean, nowMs: number): Partial<Record<Side, number>> {
    const sides = (['left', 'right'] as const).filter((s) => this.tracks[s])
    if (sides.length === 0) return {}
    const cost = (s: Side, ci: number): number => {
      const t = this.tracks[s]!
      const c = cands[ci]
      const dt = Math.max(0, (nowMs - t.lastMs) / 1000)
      const pred = { x: t.palm.x + t.vel.x * Math.min(dt, 0.25), y: t.palm.y + t.vel.y * Math.min(dt, 0.25) }
      const d = this.dist(pred, c.palm)
      const scale = Math.max(0.05, t.size)
      // How far can a palm plausibly travel? A hand-size or two plus ~2.5 image-widths/s of conducting speed.
      const gate = 1.5 * scale + 0.06 + 2.5 * Math.min(1, dt)
      if (d > gate) return Infinity
      const e = labelEvidence(c, swap)
      const disagree = Math.sign(e) !== (s === 'right' ? 1 : -1) ? Math.abs(e) : 0
      return d / scale + 0.8 * disagree
    }
    let best: { total: number; map: Partial<Record<Side, number>> } = { total: Infinity, map: {} }
    const options = (s: Side) => [-1, ...cands.map((_, i) => i)].filter((i) => i === -1 || Number.isFinite(cost(s, i)))
    const [s0, s1] = sides
    for (const i0 of options(s0)) {
      for (const i1 of s1 ? options(s1) : [-1]) {
        if (i0 !== -1 && i0 === i1) continue
        // Prefer matching as many as possible: an unmatched track costs a fixed penalty (≈ 6 hand sizes).
        const total = (i0 !== -1 ? cost(s0, i0) : 6) + (s1 ? (i1 !== -1 ? cost(s1, i1) : 6) : 0)
        if (total < best.total) best = { total, map: { ...(i0 !== -1 ? { [s0]: i0 } : {}), ...(s1 && i1 !== -1 ? { [s1]: i1 } : {}) } }
      }
    }
    return best.map
  }

  private update(side: Side, c: IdentityCandidate, swap: boolean, nowMs: number) {
    const t = this.tracks[side]!
    const dt = (nowMs - t.lastMs) / 1000
    if (dt > 0 && dt < 0.3) {
      const k = 0.5
      t.vel = { x: t.vel.x + k * ((c.palm.x - t.palm.x) / dt - t.vel.x), y: t.vel.y + k * ((c.palm.y - t.palm.y) / dt - t.vel.y) }
    } else t.vel = { x: 0, y: 0 }
    t.palm = c.palm
    t.size = t.size + 0.3 * (c.size - t.size)
    t.lastMs = nowMs
    const e = labelEvidence(c, swap)
    t.vote += 0.15 * (e - t.vote)
    // Sustained contradiction: the label says the other hand, strongly, and position does not argue against it.
    const trackSign = side === 'right' ? 1 : -1
    const posSign = Math.sign(c.palm.x - 0.5)
    const other = this.tracks[side === 'right' ? 'left' : 'right']
    const crowded = other !== null && this.dist(other.palm, c.palm) < 2.5 * Math.max(0.05, t.size)
    if (!crowded && Math.abs(c.palm.x - 0.5) > 0.05 && Math.abs(t.vote) > 0.3 && Math.sign(t.vote) !== trackSign && posSign === Math.sign(t.vote)) {
      t.contradict++
      if (t.contradict >= this.opts.relabelFrames && !other) {
        // Only a lone hand is re-assigned (with two hands the uniqueness constraint already forces the other side).
        const ns: Side = side === 'right' ? 'left' : 'right'
        this.tracks[side] = null
        this.tracks[ns] = { ...t, side: ns, contradict: 0 }
      }
    } else t.contradict = Math.max(0, t.contradict - 1)
  }

  /**
   * Online mapping check: with two well-separated, non-crossed hands, the one further right in the mirrored preview is
   * the user's right. If the resolved labels keep saying otherwise the mapping is inverted → flip it (unverified only).
   */
  private maybeLearn<T extends IdentityCandidate>(out: IdentityAssignment<T>, res: HandednessResolution, _nowMs: number) {
    void _nowMs
    if (res.verified || !out.left || !out.right) return
    const l = out.left.candidate
    const r = out.right.candidate
    if (this.dist(l.palm, r.palm) < this.opts.learnSeparation) return
    if (Math.abs(l.score) < 0.7 || Math.abs(r.score) < 0.7) return
    const swap = res.swap !== this.learnedFlip
    const el = labelEvidence(l, swap)
    const er = labelEvidence(r, swap)
    if (el < 0 && er > 0) this.learn.agree++
    else if (el > 0 && er < 0) this.learn.disagree++
    else return
    const total = this.learn.agree + this.learn.disagree
    if (total >= this.opts.learnFrames) {
      if (this.learn.disagree / total > 0.85) {
        this.learnedFlip = !this.learnedFlip
        this.reset()
      } else this.learn = { agree: Math.floor(this.learn.agree / 2), disagree: Math.floor(this.learn.disagree / 2) }
    }
  }
}
