import type { MixerGestureConfig } from '@/config/gestureConfig'
import type { Landmark } from '@/vision/types'

/**
 * Reads how many fingers a hand is holding up, from the 21 landmarks alone (no model, no training).
 * A finger is EXTENDED when its tip is clearly farther from the wrist than its knuckle (MCP) and than its middle joint
 * (PIP); curled fingers fold the tip back towards the palm. The thumb is not counted as a finger: it must be TUCKED
 * across the palm for the pose to count at all, which is what separates the deliberate "number" pose from a relaxed open
 * hand (where the thumb sticks out) during ordinary dynamics conducting.
 */
export interface FingerPose {
  /** Extended state of index, middle, ring, pinky. */
  extended: [boolean, boolean, boolean, boolean]
  /** How many of the four are extended, 0–4. */
  count: number
  thumbTucked: boolean
}

const FINGERS: readonly (readonly [number, number, number])[] = [
  [5, 6, 8], // index: MCP, PIP, tip
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
]

export function readFingerPose(lm: readonly Landmark[], aspect: number, cfg: Pick<MixerGestureConfig, 'extendedRatio' | 'thumbTuckedMax'>): FingerPose | null {
  if (lm.length < 21) return null
  const d = (a: number, b: number) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y)
  const size = d(0, 9) // wrist → middle knuckle: the hand's own scale
  if (size < 1e-4) return null
  const extended = FINGERS.map(([mcp, pip, tip]) => {
    const tipD = d(tip, 0)
    return tipD > d(pip, 0) && tipD / Math.max(1e-6, d(mcp, 0)) >= cfg.extendedRatio
  }) as FingerPose['extended']
  return { extended, count: extended.filter(Boolean).length, thumbTucked: d(4, 9) / size <= cfg.thumbTuckedMax }
}
