import type { PerformanceRecord } from './types'

export function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60)
  return `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`
}

/** Aggregate across records; returns null when there are none (never a made-up number). */
export function summarise(records: PerformanceRecord[]) {
  if (records.length === 0) return null
  const avg = (f: (r: PerformanceRecord) => number) => records.reduce((s, r) => s + f(r), 0) / records.length
  return {
    count: records.length,
    totalDurationSec: records.reduce((s, r) => s + r.durationSec, 0),
    totalBeats: records.reduce((s, r) => s + r.beatCount, 0),
    averageBpm: avg((r) => r.averageBpm),
    averageConsistency: avg((r) => r.tempoConsistency),
    averageReliability: avg((r) => r.trackingReliability),
  }
}
