/**
 * Shared types for the vision pipeline.
 *
 * COORDINATE SPACES
 *  - "raw":     what the detector sees — the un-mirrored camera frame, x/y in 0–1, origin top-left.
 *  - "display": what the user sees in the mirrored preview (x flipped). Everything downstream of the
 *               pipeline works in display space, so "right side of the screen" = the user's right.
 */
export interface Landmark { x: number; y: number; z: number }
export interface Vec2 { x: number; y: number }

export type Side = 'left' | 'right'
/** Label exactly as the detector reports it (before any validated correction). */
export type ReportedLabel = 'Left' | 'Right'
export type FrameSource = 'camera' | 'demo'

export interface RawDetection {
  /** 21 landmarks in raw space. */
  landmarks: Landmark[]
  label: ReportedLabel
  /** Detector's handedness score, 0–1. A model-reported confidence, not a measured accuracy. */
  score: number
}
export interface DetectionResult { hands: RawDetection[] }

/** 'tracking' = seen this frame; 'holding' = missed, last pose held within the grace period; 'lost' = gone. */
export type HandStatus = 'tracking' | 'holding' | 'lost'
export type LabelSource = 'reported' | 'swapped' | 'positional'

export interface HandKinematicsState {
  /** Palm velocity, normalised image units per second (display space; +y is down). */
  velocity: Vec2
  acceleration: Vec2
  speed: number
  /** Direction of travel in radians (0 = right, π/2 = down); null when effectively still. */
  direction: number | null
}

export interface TrackedHand {
  side: Side
  status: Exclude<HandStatus, 'lost'>
  /** 21 smoothed landmarks in display space. */
  landmarks: Landmark[]
  wrist: Landmark
  palm: Vec2
  fingertips: Landmark[]
  /** Wrist → middle-finger-base distance; a distance-independent scale for the hand. */
  handSize: number
  /** Smoothed detector score, 0–1. */
  confidence: number
  kinematics: HandKinematicsState
  labelSource: LabelSource
  /** True when left/right labelling has been validated (calibration or explicit user override). */
  handednessVerified: boolean
}

export interface DetectionSummary {
  reportedLabel: ReportedLabel
  score: number
  /** Palm centre in display space. */
  palm: Vec2
}

export interface SideTracking {
  status: HandStatus
  confidence: number
  /** ms since the hand was last seen (0 while tracking). */
  lostForMs: number
  /** Share of recent frames in which this hand was seen, 0–1 (measured). */
  presence: number
}

export interface TrackingSnapshot {
  left: SideTracking
  right: SideTracking
  /** Mean confidence over hands currently visible; 0 if none. */
  confidence: number
  /** Share of recent frames with at least one hand detected, 0–1 (measured). */
  reliability: number
}

export interface HandFrame {
  timestampMs: number
  source: FrameSource
  left: TrackedHand | null
  right: TrackedHand | null
  detections: DetectionSummary[]
  tracking: TrackingSnapshot
}
