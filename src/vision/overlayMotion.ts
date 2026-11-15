import type { HandFrame, Landmark, Side, TrackedHand } from './types'

/**
 * Smooth drawing of hands between detections.
 *
 * The detector delivers a pose 10–30 times a second, and it describes where the hand was when the camera captured the
 * frame — typically 60–120 ms ago. Drawing exactly that makes a fast hand look jerky and late. Instead the overlay is
 * redrawn every display frame at the position the hand has most likely reached by now: the last pose plus its velocity (from
 * the previous two detections) times the time since capture, capped, so it can never run away. Only the DRAWING is
 * predicted; beat detection and everything else still use the measured poses.
 */
export interface MotionOptions {
  /** Longest time ahead of the last pose that is extrapolated (ms). */
  maxLeadMs: number
  /** Detections further apart than this are not used to estimate a velocity (ms). */
  maxGapMs: number
  /** 0–1: how much of the estimated velocity is trusted (< 1 avoids overshoot at the end of a stroke). */
  trust: number
}

export const DEFAULT_MOTION: MotionOptions = { maxLeadMs: 140, maxGapMs: 400, trust: 0.85 }

const shift = (lm: readonly Landmark[], dx: number, dy: number): Landmark[] => lm.map((p) => ({ x: p.x + dx, y: p.y + dy, z: p.z }))

function predictHand(prev: TrackedHand | null, cur: TrackedHand, prevMs: number, curMs: number, nowMs: number, o: MotionOptions): TrackedHand {
  if (cur.status !== 'tracking' || !prev || prev.status !== 'tracking') return cur
  const dt = curMs - prevMs
  const lead = Math.min(o.maxLeadMs, nowMs - curMs)
  if (dt <= 0 || dt > o.maxGapMs || lead <= 0) return cur
  const k = (o.trust * lead) / dt
  const dx = (cur.palm.x - prev.palm.x) * k
  const dy = (cur.palm.y - prev.palm.y) * k
  const landmarks = shift(cur.landmarks, dx, dy)
  return { ...cur, landmarks, wrist: landmarks[0], palm: { x: cur.palm.x + dx, y: cur.palm.y + dy }, fingertips: cur.fingertips.map((p) => ({ x: p.x + dx, y: p.y + dy, z: p.z })) }
}

/** The frame to DRAW at `nowMs`, given the last two detections. Returns `cur` unchanged when there is nothing to predict. */
export function predictFrame(prev: HandFrame | null, cur: HandFrame, nowMs: number, o: MotionOptions = DEFAULT_MOTION): HandFrame {
  if (!prev) return cur
  const out: HandFrame = { ...cur }
  for (const side of ['left', 'right'] as Side[]) {
    const c = cur[side]
    if (c) out[side] = predictHand(prev[side], c, prev.timestampMs, cur.timestampMs, nowMs, o)
  }
  return out
}
