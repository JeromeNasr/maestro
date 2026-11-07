import type { SessionRecord } from './types'

export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const pct = (v: number | null) => (v === null ? null : Math.round(v * 100))

export interface HistorySummary {
  sessions: number
  withHands: number
  totalPlayingSec: number
  completed: number
  totalBeats: number
  /** Averages over sessions that HAVE the metric (camera sessions only); null if none do. */
  averageBpm: number | null
  consistency: number | null
  adherence: number | null
  trackingRight: number | null
  trackingLeft: number | null
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/**
 * Aggregate over history. Only sessions conducted with a real camera count towards the conducting averages: demo
 * (synthetic) and playback-only sessions are tallied but never mixed into your numbers. Null when nothing qualifies.
 */
export function summarise(records: SessionRecord[]): HistorySummary | null {
  if (records.length === 0) return null
  const cam = records.filter((r) => r.source === 'camera')
  return {
    sessions: records.length,
    withHands: cam.length,
    totalPlayingSec: records.reduce((s, r) => s + r.playingSec, 0),
    completed: records.filter((r) => r.completed).length,
    totalBeats: cam.reduce((s, r) => s + r.beats.accepted, 0),
    averageBpm: avg(cam.map((r) => r.tempo.averageBpm)),
    consistency: avg(cam.map((r) => r.tempo.consistency)),
    adherence: avg(cam.map((r) => r.patternAdherence)),
    trackingRight: avg(cam.map((r) => r.tracking.right)),
    trackingLeft: avg(cam.map((r) => r.tracking.left)),
  }
}

export const sourceLabel = (s: SessionRecord['source']) =>
  s === 'camera' ? 'Camera' : s === 'demo' ? 'Demo conductor (synthetic)' : 'Playback only (no hands tracked)'
