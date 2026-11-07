import { createPersistentStore } from '@/lib/store'
import type { SessionRecord } from './types'

const MAX_RECORDS = 200

const valid = (r: unknown): r is SessionRecord => {
  const x = r as Partial<SessionRecord> | null
  return !!x && x.version === 2 && typeof x.id === 'string' && typeof x.playingSec === 'number' && typeof x.compositionId === 'string'
}

/** Real performance history, persisted in this browser only. Records from older formats are ignored, not guessed at. */
export const historyStore = createPersistentStore<SessionRecord[]>('maestro.sessions.v2', [], (raw) =>
  Array.isArray(raw) ? raw.filter(valid).slice(-MAX_RECORDS) : [],
)

export function addRecord(r: SessionRecord) {
  historyStore.set((prev) => [...prev, r].slice(-MAX_RECORDS))
}
export function deleteRecord(id: string) {
  historyStore.set((prev) => prev.filter((r) => r.id !== id))
}
export function clearHistory() {
  historyStore.set([])
}
export const exportHistoryJson = (records: SessionRecord[] = historyStore.get()) => JSON.stringify({ app: 'MAESTRO', exportedAt: new Date().toISOString(), sessions: records }, null, 2)
