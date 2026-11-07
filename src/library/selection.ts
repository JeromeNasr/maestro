import { createPersistentStore } from '@/lib/store'
import { COMPOSITIONS, getComposition } from './compositions'

const DEFAULT_ID = COMPOSITIONS.find((c) => c.status === 'available')?.id ?? ''

/** Selected composition id, persisted. Only 'available' compositions can be selected. */
export const selectedCompositionId = createPersistentStore<string>('maestro.selectedComposition.v1', DEFAULT_ID, (raw) => {
  const c = typeof raw === 'string' ? getComposition(raw) : undefined
  return c && c.status === 'available' ? c.id : DEFAULT_ID
})

export function selectComposition(id: string): boolean {
  const c = getComposition(id)
  if (!c || c.status !== 'available') return false
  selectedCompositionId.set(id)
  return true
}
