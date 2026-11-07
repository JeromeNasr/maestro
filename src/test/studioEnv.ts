import { readFileSync } from 'node:fs'
import { vi } from 'vitest'
import { FakeStream, namedError } from './fakeMedia'

/** Serve the real MIDI files from disk when the Studio fetches them, and stub the media APIs jsdom lacks. */
export function installStudioEnv(opts: { getUserMedia?: () => Promise<unknown> } = {}) {
  vi.stubGlobal('fetch', async (url: string) => {
    try {
      const b = readFileSync(`public${url}`)
      return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
    } catch {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
    }
  })
  const stream = new FakeStream()
  const getUserMedia = vi.fn(opts.getUserMedia ?? (() => Promise.resolve(stream)))
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 640, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 480, configurable: true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
  return { stream, getUserMedia }
}
export { namedError }
