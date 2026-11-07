/** One recorded performance. Written by the recorder in Phase 6; never fabricated. */
export interface PerformanceRecord {
  id: string
  compositionId: string
  startedAt: string // ISO timestamp
  durationSec: number // measured
  beatCount: number // measured (detected beats)
  averageBpm: number // estimate (derived from beat intervals)
  tempoConsistency: number // 0–100, estimate (from interval variability)
  dynamicRangeMarks: [string, string] // lowest and highest mark reached, estimate
  trackingReliability: number // 0–100, measured (share of frames with tracked hands)
}

export type Provenance = 'measured' | 'estimate'

export const METRIC_PROVENANCE: Record<string, Provenance> = {
  duration: 'measured',
  beats: 'measured',
  reliability: 'measured',
  bpm: 'estimate',
  consistency: 'estimate',
  dynamics: 'estimate',
}
