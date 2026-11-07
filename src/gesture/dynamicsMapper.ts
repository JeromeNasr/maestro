import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'

export const DYNAMIC_MARKS = ['pp', 'p', 'mp', 'mf', 'f', 'ff'] as const
export type DynamicMark = (typeof DYNAMIC_MARKS)[number]

export const DYNAMIC_NAMES: Record<DynamicMark, string> = {
  pp: 'Pianissimo — very soft',
  p: 'Piano — soft',
  mp: 'Mezzo-piano — moderately soft',
  mf: 'Mezzo-forte — moderately loud',
  f: 'Forte — loud',
  ff: 'Fortissimo — very loud',
}

/**
 * Stateless mapping from a normalised level (0 low … 1 high) to a dynamic marking using the
 * configured boundaries. (The stateful version, with hysteresis and crescendo detection, is DynamicsTracker.)
 */
export function markForLevel(
  level: number,
  boundaries: readonly number[] = DEFAULT_GESTURE_CONFIG.dynamics.boundaries,
): DynamicMark {
  const v = Number.isFinite(level) ? level : 0
  let i = 0
  while (i < boundaries.length && v >= boundaries[i]) i++
  return DYNAMIC_MARKS[i]
}
