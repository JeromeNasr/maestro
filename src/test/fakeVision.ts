import type { DetectorFactory, HandDetector } from '@/vision/detector'
import type { DetectionResult } from '@/vision/types'
import type { FrameScheduler } from '@/vision/visionSession'
import { vi } from 'vitest'

export class ManualScheduler implements FrameScheduler {
  pending = new Map<number, (t: number) => void>()
  private id = 0
  request(cb: (t: number) => void) {
    this.pending.set(++this.id, cb)
    return this.id
  }
  cancel(id: number) {
    this.pending.delete(id)
  }
  get count() {
    return this.pending.size
  }
  /** Run one scheduled frame callback if there is one. */
  step() {
    const [id, cb] = [...this.pending.entries()][0] ?? []
    if (id === undefined) return false
    this.pending.delete(id)
    cb!(0)
    return true
  }
}

export function fakeDoc() {
  const listeners = new Set<() => void>()
  return {
    hidden: false,
    listeners,
    addEventListener: vi.fn((_: string, cb: () => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: () => void) => listeners.delete(cb)),
    fire() {
      listeners.forEach((l) => l())
    },
  }
}

/** A detector whose output is scripted by a function of the frame timestamp. */
export class ScriptedDetector implements HandDetector {
  delegate: 'CPU' | 'GPU' = 'CPU'
  assetOrigin = 'test' as const
  closed = false
  setMinConfidence = vi.fn()
  constructor(public script: (tsMs: number) => DetectionResult) {}
  detect(_v: HTMLVideoElement, ts: number) {
    return this.script(ts)
  }
  close() {
    this.closed = true
  }
}

export const detectorFactory = (d: HandDetector): DetectorFactory => () => Promise.resolve(d)
