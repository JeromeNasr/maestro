import { useSyncExternalStore } from 'react'

/** Minimal external store: framework-agnostic core, React binding via useStore. */
export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next
      if (Object.is(value, state)) return
      state = value
      listeners.forEach((l) => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Store persisted to localStorage. All storage access is guarded (private mode, quota, SSR). */
export function createPersistentStore<T>(key: string, initial: T, revive?: (raw: unknown) => T): Store<T> {
  let start = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      start = revive ? revive(parsed) : (parsed as T)
    }
  } catch {
    start = initial
  }
  const store = createStore<T>(start)
  store.subscribe(() => {
    try {
      localStorage.setItem(key, JSON.stringify(store.get()))
    } catch {
      /* persistence is best-effort */
    }
  })
  return store
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
