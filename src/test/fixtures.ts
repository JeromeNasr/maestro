import { makeHandLandmarks } from '@/vision/demoSource'
import type { DetectionResult, HandFrame, Landmark, RawDetection, ReportedLabel, Side, TrackedHand, TrackingSnapshot } from '@/vision/types'

/** Deterministic pseudo-random numbers (so noise-based tests are reproducible). */
export function rng(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** A raw (un-mirrored) detection whose palm appears at (displayX, y) in the mirrored preview. */
export function rawHand(label: ReportedLabel, displayX: number, y = 0.5, score = 0.95, jitter?: () => number): RawDetection {
  const side: Side = label === 'Left' ? 'left' : 'right'
  const display = makeHandLandmarks(displayX, y, 0.16, side)
  return {
    label,
    score,
    landmarks: display.map((p) => ({ x: 1 - p.x + (jitter ? (jitter() - 0.5) * 0.02 : 0), y: p.y + (jitter ? (jitter() - 0.5) * 0.02 : 0), z: p.z })),
  }
}

export const result = (...hands: RawDetection[]): DetectionResult => ({ hands })

export const EMPTY_TRACKING: TrackingSnapshot = {
  left: { status: 'lost', confidence: 0, lostForMs: 0, presence: 0 },
  right: { status: 'lost', confidence: 0, lostForMs: 0, presence: 0 },
  confidence: 0,
  reliability: 0,
}

export function trackedHand(side: Side, x: number, y: number, status: TrackedHand['status'] = 'tracking'): TrackedHand {
  const landmarks: Landmark[] = makeHandLandmarks(x, y, 0.16, side)
  return {
    side, status, landmarks, wrist: landmarks[0], palm: { x, y }, fingertips: [], handSize: 0.16, confidence: 0.95,
    kinematics: { velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, speed: 0, direction: null },
    labelSource: 'reported', handednessVerified: true,
  }
}

/** Minimal HandFrame for calibration tests. */
export function frame(opts: { detections?: { label: ReportedLabel; x: number; y?: number }[]; left?: TrackedHand | null; right?: TrackedHand | null }): HandFrame {
  return {
    timestampMs: 0,
    source: 'camera',
    left: opts.left ?? null,
    right: opts.right ?? null,
    detections: (opts.detections ?? []).map((d) => ({ reportedLabel: d.label, score: 0.95, palm: { x: d.x, y: d.y ?? 0.5 } })),
    tracking: EMPTY_TRACKING,
  }
}
