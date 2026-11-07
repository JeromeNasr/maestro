import { isAllowedUrl, type FromWorker, type ToWorker } from './detectorProtocol'
import type { DetectorFactory, HandDetector } from './detector'
import { WorkerHandDetector, withFallback } from './workerDetector'

class FakeWorker {
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  sent: ToWorker[] = []
  terminated = false
  autoReady: 'GPU' | 'CPU' | null = 'CPU'
  postMessage(m: ToWorker) {
    this.sent.push(m)
    if (m.type === 'init' && this.autoReady) queueMicrotask(() => this.reply({ type: 'ready', delegate: this.autoReady! }))
  }
  terminate() {
    this.terminated = true
  }
  reply(m: FromWorker) {
    this.onmessage?.({ data: m } as MessageEvent<FromWorker>)
  }
}
const fakeBitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('createImageBitmap', vi.fn(async () => fakeBitmap()))
  vi.stubGlobal('fetch', async () => ({ ok: false, headers: { get: () => null } })) // asset check → CDN
})
afterEach(() => vi.unstubAllGlobals())

const OPTS = { minConfidence: 0.6 }
async function create(w = new FakeWorker()) {
  const d = await WorkerHandDetector.create(OPTS, () => w as unknown as Worker)
  return { d, w }
}

describe('WorkerHandDetector', () => {
  it('initialises the worker with the options, assets and an origin allow-list, then reports its delegate', async () => {
    const { d, w } = await create()
    const init = w.sent[0] as Extract<ToWorker, { type: 'init' }>
    expect(init).toMatchObject({ type: 'init', minConfidence: 0.6, delegate: 'auto' })
    expect(init.allowedOrigins).toEqual(['https://cdn.jsdelivr.net', 'https://storage.googleapis.com'])
    expect(d.delegate).toBe('CPU')
    expect(d.assetOrigin).toBe('cdn')
  })

  it('detect() transfers one frame to the worker and resolves with its result', async () => {
    const { d, w } = await create()
    const p = d.detect({} as HTMLVideoElement, 123)
    await vi.waitFor(() => expect(w.sent.some((m) => m.type === 'detect')).toBe(true))
    const m = w.sent.find((x) => x.type === 'detect') as Extract<ToWorker, { type: 'detect' }>
    expect(m.ts).toBe(123)
    w.reply({ type: 'result', id: m.id, result: { hands: [] } })
    expect(await p).toEqual({ hands: [] })
  })

  it('matches results to requests by id', async () => {
    const { d, w } = await create()
    const a = d.detect({} as HTMLVideoElement, 1)
    const b = d.detect({} as HTMLVideoElement, 2)
    await vi.waitFor(() => expect(w.sent.filter((m) => m.type === 'detect')).toHaveLength(2))
    const [m1, m2] = w.sent.filter((m) => m.type === 'detect') as Extract<ToWorker, { type: 'detect' }>[]
    w.reply({ type: 'result', id: m2.id, result: { hands: [{ landmarks: [], label: 'Left', score: 0.9 }] } })
    w.reply({ type: 'result', id: m1.id, result: { hands: [] } })
    expect((await a).hands).toHaveLength(0)
    expect((await b).hands).toHaveLength(1)
  })

  it('a worker error for a frame rejects that frame', async () => {
    const { d, w } = await create()
    const p = d.detect({} as HTMLVideoElement, 1)
    await vi.waitFor(() => expect(w.sent.some((m) => m.type === 'detect')).toBe(true))
    const m = w.sent.find((x) => x.type === 'detect') as Extract<ToWorker, { type: 'detect' }>
    w.reply({ type: 'error', id: m.id, message: 'boom' })
    await expect(p).rejects.toThrow('boom')
  })

  it('a crashed worker rejects everything in flight', async () => {
    const { d, w } = await create()
    const p = d.detect({} as HTMLVideoElement, 1)
    await vi.waitFor(() => expect(w.sent.some((m) => m.type === 'detect')).toBe(true))
    w.onerror?.({ message: 'worker died' } as ErrorEvent)
    await expect(p).rejects.toThrow('worker died')
  })

  it('close() terminates the worker, rejects pending frames, and later detects fail', async () => {
    const { d, w } = await create()
    const p = d.detect({} as HTMLVideoElement, 1)
    await vi.waitFor(() => expect(w.sent.some((m) => m.type === 'detect')).toBe(true))
    d.close()
    d.close() // idempotent
    expect(w.terminated).toBe(true)
    expect(w.sent.some((m) => m.type === 'close')).toBe(true)
    await expect(p).rejects.toThrow('closed')
    await expect(d.detect({} as HTMLVideoElement, 2)).rejects.toThrow('closed')
  })

  it('setMinConfidence is forwarded', async () => {
    const { d, w } = await create()
    d.setMinConfidence(0.4)
    expect(w.sent.at(-1)).toEqual({ type: 'setMinConfidence', value: 0.4 })
  })

  it('a worker that fails to initialise is terminated and the error propagates', async () => {
    const w = new FakeWorker()
    w.autoReady = null
    const p = WorkerHandDetector.create(OPTS, () => w as unknown as Worker)
    await vi.waitFor(() => expect(w.sent.length).toBe(1))
    w.reply({ type: 'error', message: 'wasm failed' })
    await expect(p).rejects.toThrow('wasm failed')
    expect(w.terminated).toBe(true)
  })

  it('refuses to start where workers or ImageBitmap are unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    await expect(WorkerHandDetector.create(OPTS, () => new FakeWorker() as unknown as Worker)).rejects.toThrow(/not available/)
  })
})

describe('withFallback', () => {
  const det = (name: string) => ({ name }) as unknown as HandDetector
  it('uses the primary when it works', async () => {
    const f: DetectorFactory = withFallback(async () => det('worker'), async () => det('main'))
    expect(await f(OPTS)).toMatchObject({ name: 'worker' })
  })
  it('falls back to the main-thread detector when the worker cannot start', async () => {
    const f: DetectorFactory = withFallback(() => Promise.reject(new Error('no workers')), async () => det('main'))
    expect(await f(OPTS)).toMatchObject({ name: 'main' })
  })
  it('surfaces the fallback\'s own failure', async () => {
    const f: DetectorFactory = withFallback(() => Promise.reject(new Error('a')), () => Promise.reject(new Error('b')))
    await expect(f(OPTS)).rejects.toThrow('b')
  })
})

describe('worker network egress guard', () => {
  const self = 'http://localhost:5173'
  const allowed = ['https://cdn.jsdelivr.net', 'https://storage.googleapis.com']
  it('allows same-origin, blob/data and the documented CDN fallbacks', () => {
    for (const u of ['/models/hand_landmarker.task', 'http://localhost:5173/mediapipe/wasm/x.wasm', 'blob:http://localhost:5173/abc', 'data:text/plain,hi', 'https://cdn.jsdelivr.net/npm/x', 'https://storage.googleapis.com/m/x.task']) expect(isAllowedUrl(u, self, allowed), u).toBe(true)
  })
  it('blocks MediaPipe\'s telemetry endpoint and any other origin', () => {
    for (const u of ['https://odml.pa.googleapis.com/v1/log', 'https://example.com/upload', 'http://localhost:9999/x', 'https://googleapis.com/']) expect(isAllowedUrl(u, self, allowed), u).toBe(false)
  })
  it('treats unparsable URLs as blocked', () => {
    expect(isAllowedUrl('http://[bad', self, allowed)).toBe(false)
  })
})
