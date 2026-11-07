import type { PerformanceRecord } from './types'

/** SAMPLE DATA for layout preview only. Not produced by any performance. Always shown with a "Demo data" label. */
export const SAMPLE_RECORDS: PerformanceRecord[] = [
  { id: 's1', compositionId: 'maestro-demo-001', startedAt: '2026-01-01T10:00:00Z', durationSec: 84, beatCount: 112, averageBpm: 76, tempoConsistency: 68, dynamicRangeMarks: ['p', 'mf'], trackingReliability: 88 },
  { id: 's2', compositionId: 'maestro-demo-001', startedAt: '2026-01-02T10:00:00Z', durationSec: 90, beatCount: 128, averageBpm: 82, tempoConsistency: 74, dynamicRangeMarks: ['pp', 'f'], trackingReliability: 91 },
  { id: 's3', compositionId: 'maestro-demo-001', startedAt: '2026-01-03T10:00:00Z', durationSec: 90, beatCount: 131, averageBpm: 86, tempoConsistency: 81, dynamicRangeMarks: ['pp', 'ff'], trackingReliability: 94 },
]
