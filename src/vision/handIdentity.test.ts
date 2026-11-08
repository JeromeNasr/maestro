import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { simulate } from '@/test/conductorSim'
import { rng } from '@/test/fixtures'
import { HandIdentityTracker, type IdentityCandidate } from './handIdentity'
import type { HandednessResolution } from './handedness'
import type { ReportedLabel } from './types'

// Real MediaPipe on an un-mirrored frame: the user's right hand is reported "Left". The documented default is swap=true.
const DOC: HandednessResolution = { swap: true, verified: false, origin: 'unverified-default' }
const VERIFIED_SWAP: HandednessResolution = { swap: true, verified: true, origin: 'calibration' }
const mk = (label: ReportedLabel, x: number, y = 0.5, score = 0.95): IdentityCandidate => ({ label, score, palm: { x, y }, size: 0.16 })
/** What a mirrored-input-inverted detector reports for the user's right / left hand at display x. */
const usersRight = (x: number, y = 0.5, score = 0.95) => mk('Left', x, y, score)
const usersLeft = (x: number, y = 0.5, score = 0.95) => mk('Right', x, y, score)

describe('HandIdentityTracker — single hands', () => {
  it('right hand alone is the right hand (labels inverted by the detector, documented swap applied)', () => {
    const t = new HandIdentityTracker()
    const a = t.assign([usersRight(0.7)], DOC, 0)
    expect(a.right).not.toBeNull()
    expect(a.left).toBeNull()
  })
  it('left hand alone is the left hand', () => {
    const a = new HandIdentityTracker().assign([usersLeft(0.3)], DOC, 0)
    expect(a.left).not.toBeNull()
    expect(a.right).toBeNull()
  })
  it('a lone hand keeps its identity when its label flickers every other frame', () => {
    const t = new HandIdentityTracker()
    let wrong = 0
    for (let i = 0; i < 90; i++) {
      const label: ReportedLabel = i % 2 ? 'Left' : 'Right'
      const a = t.assign([{ ...mk(label, 0.7 + 0.03 * Math.sin(i / 5)) }], VERIFIED_SWAP, i * 33)
      if (!a.right || a.left) wrong++
    }
    expect(wrong).toBe(0)
  })
  it('survives 30% random label flicker over a long single-hand session', () => {
    const t = new HandIdentityTracker()
    const r = rng(7)
    let wrong = 0
    let wrongLate = 0
    for (let i = 0; i < 600; i++) {
      const trueLabel: ReportedLabel = 'Left' // the user's right hand
      const label: ReportedLabel = r() < 0.3 ? 'Right' : trueLabel
      const a = t.assign([mk(label, 0.65 + 0.15 * Math.sin(i / 7), 0.5 + 0.1 * Math.cos(i / 5))], VERIFIED_SWAP, i * 33)
      if (!a.right) {
        wrong++
        if (i >= 60) wrongLate++
      }
    }
    // If the very first frames' labels are unlucky the hand may start on the wrong side, but it must correct itself
    // within about a second and never flip again.
    expect(wrongLate).toBe(0)
    expect(wrong).toBeLessThan(40)
  })
})

describe('HandIdentityTracker — both hands', () => {
  it('assigns two hands correctly, in either order of detection', () => {
    const t = new HandIdentityTracker()
    const a = t.assign([usersLeft(0.25), usersRight(0.75)], DOC, 0)
    expect(a.left!.candidate.palm.x).toBe(0.25)
    expect(a.right!.candidate.palm.x).toBe(0.75)
    const b = new HandIdentityTracker().assign([usersRight(0.75, 0.5, 0.99), usersLeft(0.25, 0.5, 0.8)], DOC, 0)
    expect(b.right!.candidate.palm.x).toBe(0.75)
  })
  it('two hands carrying the SAME label (a labelling error) are split by position', () => {
    const a = new HandIdentityTracker().assign([mk('Left', 0.3), mk('Left', 0.72)], DOC, 0)
    expect(a.left!.candidate.palm.x).toBe(0.3)
    expect(a.right!.candidate.palm.x).toBe(0.72)
  })
  it('a hand that appears while the other is tracked takes the free side, whatever its label says', () => {
    const t = new HandIdentityTracker()
    t.assign([usersRight(0.72)], DOC, 0)
    const a = t.assign([usersRight(0.72), mk('Left', 0.28)], DOC, 33) // the new hand is mislabelled (also "Left")
    expect(a.right!.candidate.palm.x).toBe(0.72)
    expect(a.left!.candidate.palm.x).toBe(0.28)
  })
})

describe('HandIdentityTracker — crossing, loss and edges', () => {
  it('keeps identities when the hands cross each other (position says the opposite of identity)', () => {
    const t = new HandIdentityTracker()
    const r = rng(3)
    let swapped = 0
    for (let i = 0; i <= 60; i++) {
      const u = i / 60
      const rx = 0.75 - 0.5 * u // right hand travels to the far left
      const lx = 0.25 + 0.5 * u // left hand travels to the far right
      // Near the crossing point the detector's labels are unreliable (random).
      const unreliable = Math.abs(rx - lx) < 0.25
      const lab = (own: ReportedLabel): ReportedLabel => (unreliable && r() < 0.5 ? (own === 'Left' ? 'Right' : 'Left') : own)
      const a = t.assign([{ ...usersRight(rx, 0.44), label: lab('Left') }, { ...usersLeft(lx, 0.58), label: lab('Right') }], VERIFIED_SWAP, i * 33)
      if (a.right?.candidate.palm.x !== rx || a.left?.candidate.palm.x !== lx) swapped++
    }
    expect(swapped).toBe(0)
  })
  it('a hand missing for a short time resumes as the same hand', () => {
    const t = new HandIdentityTracker()
    t.assign([usersRight(0.7)], VERIFIED_SWAP, 0)
    expect(t.assign([], VERIFIED_SWAP, 100).right).toBeNull()
    const back = t.assign([mk('Right', 0.74)], VERIFIED_SWAP, 400) // label now WRONG, position + memory say right hand
    expect(back.right).not.toBeNull()
  })
  it('forgets a hand after the memory window, so a new hand is judged afresh', () => {
    const t = new HandIdentityTracker({ memoryMs: 500 })
    t.assign([usersRight(0.7)], VERIFIED_SWAP, 0)
    const later = t.assign([usersLeft(0.3)], VERIFIED_SWAP, 2000)
    expect(later.left).not.toBeNull()
    expect(later.right).toBeNull()
  })
  it('a hand leaving through the right edge and returning there stays the right hand', () => {
    const t = new HandIdentityTracker()
    for (let i = 0; i < 10; i++) t.assign([usersRight(0.8 + 0.02 * i)], VERIFIED_SWAP, i * 33)
    t.assign([], VERIFIED_SWAP, 400)
    t.assign([], VERIFIED_SWAP, 600)
    const back = t.assign([usersRight(0.97)], VERIFIED_SWAP, 700)
    expect(back.right).not.toBeNull()
  })
  it('ignores a third hand (keeps the two most confident)', () => {
    const a = new HandIdentityTracker().assign([usersLeft(0.2, 0.5, 0.6), usersRight(0.8, 0.5, 0.95), usersLeft(0.3, 0.5, 0.9)], VERIFIED_SWAP, 0)
    expect(a.right!.candidate.palm.x).toBe(0.8)
    expect(a.left!.candidate.palm.x).toBe(0.3)
  })
})

describe('HandIdentityTracker — wrong or unknown label mapping', () => {
  it('learns online that the mapping is inverted when two separated hands keep disagreeing with their positions', () => {
    const t = new HandIdentityTracker()
    // This camera does NOT invert (labels equal the user's side) but the documented default swaps: every label looks wrong.
    for (let i = 0; i < 40; i++) t.assign([mk('Left', 0.25), mk('Right', 0.75)], DOC, i * 33)
    expect(t.learnedSwap).toBe(true)
    const a = t.assign([mk('Right', 0.75)], DOC, 41 * 33)
    expect(a.right).not.toBeNull() // a lone right hand is now read correctly
  })
  it('does not learn anything from a correct mapping, or when the mapping is verified', () => {
    const t = new HandIdentityTracker()
    for (let i = 0; i < 80; i++) t.assign([usersLeft(0.25), usersRight(0.75)], DOC, i * 33)
    expect(t.learnedSwap).toBe(false)
    const v = new HandIdentityTracker()
    for (let i = 0; i < 80; i++) v.assign([mk('Left', 0.25), mk('Right', 0.75)], VERIFIED_SWAP, i * 33)
    expect(v.learnedSwap).toBe(false)
  })
})

describe('Right-hand conducting through the real pipeline with realistic detector behaviour', () => {
  const beatsOk = (labelFlicker: number, handedness?: HandednessResolution, extra = {}) => {
    const r = simulate({ demo: { bpm: 90, timeSignature: '4/4', style: 'flowing', noise: 0.004, labelFlicker, ...extra }, handedness, seconds: 24 })
    const seq = r.beats.map((b) => b.beatInBar)
    const outOfOrder = seq.filter((b, i) => i > 0 && b !== (seq[i - 1] % 4) + 1).length
    return { r, outOfOrder, bpm: r.tempos.at(-1)?.bpm ?? NaN }
  }
  it('inverted labels, verified swap: beats come from the right hand', () => {
    const { r, outOfOrder, bpm } = beatsOk(0)
    expect(r.beats.length).toBeGreaterThan(24 * 1.5 * 0.7)
    expect(outOfOrder).toBe(0)
    expect(Math.abs(bpm - 90) / 90).toBeLessThan(0.04)
  })
  it('inverted labels with the UNVERIFIED default (no calibration) also conduct correctly', () => {
    const { r, outOfOrder, bpm } = beatsOk(0, DOC)
    expect(r.beats.length).toBeGreaterThan(24 * 1.5 * 0.7)
    expect(outOfOrder).toBe(0)
    expect(Math.abs(bpm - 90) / 90).toBeLessThan(0.04)
  })
  it('keeps conducting with 25% of labels flipped at random', () => {
    const { r, outOfOrder, bpm } = beatsOk(0.25, DOC)
    expect(r.beats.length).toBeGreaterThan(24 * 1.5 * 0.7)
    expect(outOfOrder).toBe(0)
    expect(Math.abs(bpm - 90) / 90).toBeLessThan(0.05)
    expect(r.frames.filter((f) => f.right && f.right.palm.x < 0.5).length).toBe(0) // the right hand never jumps to the left side
  })
  it('a camera whose labels are NOT inverted (default swap wrong) self-corrects and then conducts', () => {
    const { r, bpm } = beatsOk(0, DOC, { labelModel: 'as-user' })
    expect(r.beats.length).toBeGreaterThan(24 * 1.5 * 0.5)
    expect(Math.abs(bpm - 90) / 90).toBeLessThan(0.06)
  })
  it('right hand ALONE (left hand not in frame) conducts and never produces a left hand', () => {
    const { r, outOfOrder } = beatsOk(0.1, DOC, { visible: (side: string) => side === 'right' })
    expect(r.beats.length).toBeGreaterThan(24 * 1.5 * 0.7)
    expect(outOfOrder).toBe(0)
    expect(r.frames.some((f) => f.left?.status === 'tracking')).toBe(false)
  })
  it('left hand ALONE produces dynamics but never beats', () => {
    const r = simulate({ demo: { bpm: 90, leftLevel: 0.9, visible: (side: string) => side === 'left', labelFlicker: 0.1 }, handedness: DOC, seconds: 12 })
    expect(r.beats).toHaveLength(0)
    expect(r.frames.some((f) => f.right?.status === 'tracking')).toBe(false)
    expect(r.engine.snapshot.dynamics.level).toBeGreaterThan(0.7)
  })
  it('config default has sane identity-related tracking values', () => {
    expect(DEFAULT_GESTURE_CONFIG.tracking.lossGraceMs).toBeGreaterThan(0)
  })
})
