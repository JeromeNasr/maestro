import { createPersistentStore } from '@/lib/store'
import { DEFAULT_GESTURE_CONFIG, type GestureConfig } from './gestureConfig'

/** Deep-merge saved overrides onto defaults so newly added parameters always have a value. */
export function mergeConfig<T>(base: T, over: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return over !== undefined && typeof over === typeof base ? (over as T) : base
  }
  if (typeof over !== 'object' || over === null) return base
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(base as object)) {
    out[k] = mergeConfig((base as Record<string, unknown>)[k], (over as Record<string, unknown>)[k])
  }
  return out as T
}

export const gestureSettings = createPersistentStore<GestureConfig>(
  'maestro.gestureConfig.v1',
  DEFAULT_GESTURE_CONFIG,
  (raw) => mergeConfig(DEFAULT_GESTURE_CONFIG, raw),
)

export function resetGestureSettings() {
  gestureSettings.set(DEFAULT_GESTURE_CONFIG)
}
