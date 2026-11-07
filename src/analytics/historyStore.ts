import { createPersistentStore } from '@/lib/store'
import type { PerformanceRecord } from './types'

const MAX_RECORDS = 200

/** Real performance history (empty until Phase 6 records performances). */
export const historyStore = createPersistentStore<PerformanceRecord[]>('maestro.history.v1', [], (raw) =>
  Array.isArray(raw) ? (raw as PerformanceRecord[]).slice(-MAX_RECORDS) : [],
)

export function addRecord(r: PerformanceRecord) {
  historyStore.set((prev) => [...prev, r].slice(-MAX_RECORDS))
}

export function clearHistory() {
  historyStore.set([])
}
