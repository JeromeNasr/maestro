import type { TimeSignature } from '@/config/gestureConfig'

export interface Point { x: number; y: number }
export interface TeachingPattern {
  timeSignature: TimeSignature
  /** Position of each beat's ictus (the point where the beat is felt), in a 100×100 box. */
  ictus: Point[]
  /** Direction word for each beat's stroke, in order. */
  strokes: string[]
}

/** Educational simplified patterns (as specified). Detection patterns for Phase 3 will reuse this order. */
export const TEACHING_PATTERNS: Record<TimeSignature, TeachingPattern> = {
  '2/4': { timeSignature: '2/4', ictus: [{ x: 50, y: 80 }, { x: 50, y: 20 }], strokes: ['Down', 'Up'] },
  '3/4': { timeSignature: '3/4', ictus: [{ x: 50, y: 80 }, { x: 78, y: 52 }, { x: 50, y: 20 }], strokes: ['Down', 'Right', 'Up'] },
  '4/4': {
    timeSignature: '4/4',
    ictus: [{ x: 50, y: 80 }, { x: 22, y: 55 }, { x: 78, y: 55 }, { x: 50, y: 20 }],
    strokes: ['Down', 'Left', 'Right', 'Up'],
  },
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * Hand position at a continuous beat position `beats` (0 = ictus of beat 1, 1 = ictus of beat 2, …).
 * The hand sits exactly on ictus[k] at integer beat k, and moves with eased motion to ictus[k+1] by beat k+1.
 * `beat` is the index of the most recently reached ictus.
 */
export function positionAt(pattern: TeachingPattern, beats: number): { point: Point; beat: number } {
  const n = pattern.ictus.length
  const pos = ((beats % n) + n) % n
  const k = Math.floor(pos)
  const s = smooth(pos - k)
  const a = pattern.ictus[k]
  const b = pattern.ictus[(k + 1) % n]
  return { point: { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }, beat: k }
}
