import { vi } from 'vitest'

export class FakeTrack {
  stopped = false
  label = 'Fake Camera'
  private listeners = new Map<string, Set<() => void>>()
  stop = vi.fn(() => {
    this.stopped = true
  })
  addEventListener(type: string, cb: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(cb)
  }
  removeEventListener(type: string, cb: () => void) {
    this.listeners.get(type)?.delete(cb)
  }
  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0
  }
  /** Simulate the device disappearing. */
  end() {
    this.listeners.get('ended')?.forEach((cb) => cb())
  }
}

export class FakeStream {
  track = new FakeTrack()
  getTracks = () => [this.track]
  getVideoTracks = () => [this.track]
}

export interface FakeVideo extends HTMLVideoElement {
  __setTime(t: number): void
}

/** A <video> with the media pieces jsdom does not implement. */
export function makeVideo(width = 640, height = 480): FakeVideo {
  const v = document.createElement('video') as FakeVideo
  let time = 0
  Object.defineProperty(v, 'videoWidth', { get: () => width })
  Object.defineProperty(v, 'videoHeight', { get: () => height })
  Object.defineProperty(v, 'readyState', { get: () => 4 })
  Object.defineProperty(v, 'currentTime', { get: () => time, set: (x) => (time = x), configurable: true })
  v.play = vi.fn().mockResolvedValue(undefined)
  v.pause = vi.fn()
  v.__setTime = (t) => (time = t)
  return v
}

export function namedError(name: string) {
  return Object.assign(new Error(name), { name })
}
