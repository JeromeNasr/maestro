import { DEFAULT_GESTURE_CONFIG, type GestureConfig } from '@/config/gestureConfig'
import { gestureSettings } from '@/config/settings'
import { FakeStream, makeVideo, namedError, type FakeVideo } from '@/test/fakeMedia'
import { rawHand, result } from '@/test/fixtures'
import { CameraController } from './camera'
import { calibrationStore } from './calibration'
import type { DetectorOptions, HandDetector } from './detector'
import type { DetectionResult, HandFrame } from './types'
import { effectiveMinConfidence, VisionSession, type FrameScheduler, type VisionSnapshot } from './visionSession'

class FakeDetector implements HandDetector {
  delegate: 'GPU' | 'CPU' = 'CPU'
  /** Simulated inference cost; advances the test clock inside detect(). */
  costMs = 0
  clock: { t: number } | null = null
  assetOrigin = 'test' as const
  closed = false
  timestamps: number[] = []
  script: () => DetectionResult = () => result(rawHand('Left', 0.25), rawHand('Right', 0.75))
  throwOnDetect = false
  setMinConfidence = vi.fn()
  detect(_v: HTMLVideoElement, ts: number) {
    if (this.throwOnDetect) throw new Error('inference failed')
    this.timestamps.push(ts)
    if (this.clock) this.clock.t += this.costMs
    return this.script()
  }
  close() {
    this.closed = true
  }
}

class ManualScheduler implements FrameScheduler {
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
  step() {
    const [id, cb] = [...this.pending.entries()][0] ?? []
    if (id === undefined) throw new Error('no frame scheduled')
    this.pending.delete(id)
    cb!(0)
  }
}

function fakeDoc() {
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

function setup(opts: { getUserMedia?: () => Promise<MediaStream>; config?: Partial<GestureConfig>; detectorFails?: boolean; createDetector?: (o: DetectorOptions) => Promise<HandDetector> } = {}) {
  const stream = new FakeStream()
  const getUserMedia = vi.fn(opts.getUserMedia ?? (() => Promise.resolve(stream as unknown as MediaStream)))
  const detector = new FakeDetector()
  const createDetector = vi.fn((o: DetectorOptions) => (opts.createDetector ? opts.createDetector(o) : opts.detectorFails ? Promise.reject(new Error('load failed')) : Promise.resolve(detector as HandDetector)))
  const scheduler = new ManualScheduler()
  const doc = fakeDoc()
  const clock = { t: 1000 }
  detector.clock = clock
  const camera = new CameraController({ mediaDevices: { getUserMedia }, isSecureContext: true })
  const config = { ...DEFAULT_GESTURE_CONFIG, ...opts.config }
  const session = new VisionSession({ createDetector, camera, scheduler, doc, now: () => clock.t, getConfig: opts.config ? () => config : () => gestureSettings.get() })
  const video: FakeVideo = makeVideo()
  session.attachVideo(video)
  const statuses: string[] = []
  session.store.subscribe(() => {
    const s = session.store.get().status
    if (statuses.at(-1) !== s) statuses.push(s)
  })
  /** Advance the clock and process exactly one frame (with a "new" video frame). */
  const frame = (dtMs = 33) => {
    clock.t += dtMs
    video.__setTime(video.currentTime + dtMs / 1000)
    scheduler.step()
  }
  return { session, stream, getUserMedia, detector, createDetector, scheduler, doc, clock, video, statuses, frame }
}

describe('VisionSession — camera lifecycle', () => {
  it('never touches the camera or loads a model until startCamera() is called', () => {
    const { getUserMedia, createDetector, session } = setup()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(createDetector).not.toHaveBeenCalled()
    expect(session.store.get().status).toBe('idle')
  })

  it('starts: permission → model → running, with a frame loop scheduled', async () => {
    const s = setup()
    await s.session.startCamera()
    expect(s.statuses).toEqual(['requesting-permission', 'loading-model', 'running'])
    expect(s.getUserMedia).toHaveBeenCalledTimes(1)
    expect(s.session.store.get()).toMatchObject({ status: 'running', source: 'camera', delegate: 'CPU', videoSize: { width: 640, height: 480 } })
    expect(s.scheduler.count).toBe(1)
  })

  it('ignores a second startCamera() while already running', async () => {
    const s = setup()
    await s.session.startCamera()
    await s.session.startCamera()
    expect(s.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('processes frames: emits to listeners, updates the store, tracks both hands', async () => {
    const s = setup()
    const frames: (HandFrame | null)[] = []
    s.session.onFrame((f) => frames.push(f))
    await s.session.startCamera()
    s.frame()
    s.frame(150) // beyond the 100 ms UI throttle
    expect(frames.filter(Boolean)).toHaveLength(2)
    const snap = s.session.store.get()
    expect(snap.left.status).toBe('tracking')
    expect(snap.right.status).toBe('tracking')
    expect(snap.confidence).toBeGreaterThan(0.9)
    expect(snap.fps).toBeGreaterThan(0)
  })

  it('skips frames when the video has not advanced', async () => {
    const s = setup()
    await s.session.startCamera()
    s.frame()
    s.scheduler.step() // same currentTime → no new frame
    expect(s.detector.timestamps).toHaveLength(1)
  })

  it('always passes strictly increasing timestamps to the detector', async () => {
    const s = setup()
    await s.session.startCamera()
    for (let i = 0; i < 5; i++) s.frame(0) // clock does not advance
    const ts = s.detector.timestamps
    expect(ts.every((t, i) => i === 0 || t > ts[i - 1])).toBe(true)
  })

  it('stop() releases everything: tracks, detector, loop, listener, video', async () => {
    const s = setup()
    const frames: (HandFrame | null)[] = []
    s.session.onFrame((f) => frames.push(f))
    await s.session.startCamera()
    s.frame()
    s.session.stop()
    expect(s.stream.track.stop).toHaveBeenCalled()
    expect(s.detector.closed).toBe(true)
    expect(s.scheduler.count).toBe(0)
    expect(s.doc.listeners.size).toBe(0)
    expect(s.video.srcObject).toBeNull()
    expect(frames.at(-1)).toBeNull() // overlay cleared
    expect(s.session.store.get()).toMatchObject({ status: 'idle', source: null, fps: 0 })
  })

  it('can restart after stop', async () => {
    const s = setup()
    await s.session.startCamera()
    s.session.stop()
    await s.session.startCamera()
    expect(s.session.store.get().status).toBe('running')
    expect(s.getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('stop() while the permission prompt is open releases the late stream and the model', async () => {
    let resolve!: (s: MediaStream) => void
    const s = setup({ getUserMedia: () => new Promise<MediaStream>((r) => (resolve = r)) })
    const p = s.session.startCamera()
    expect(s.session.store.get().status).toBe('requesting-permission')
    s.session.stop()
    resolve(s.stream as unknown as MediaStream)
    await p
    expect(s.stream.track.stop).toHaveBeenCalled()
    expect(s.session.store.get().status).toBe('idle')
    await Promise.resolve()
    expect(s.detector.closed).toBe(true)
  })

  it('dispose() is idempotent, releases resources and stops reacting to settings', async () => {
    const s = setup()
    await s.session.startCamera()
    s.session.dispose()
    s.session.dispose()
    expect(s.stream.track.stop).toHaveBeenCalled()
    expect(s.detector.closed).toBe(true)
    expect(s.doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    s.detector.setMinConfidence.mockClear()
    gestureSettings.set((c) => ({ ...c, tracking: { ...c.tracking, sensitivity: 1.4 } }))
    expect(s.detector.setMinConfidence).not.toHaveBeenCalled()
    await s.session.startCamera() // a disposed session cannot be restarted
    expect(s.getUserMedia).toHaveBeenCalledTimes(1)
  })
})

describe('VisionSession — errors', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['NotFoundError', 'no-device'],
    ['NotReadableError', 'in-use'],
  ])('%s → error state "%s", model discarded, retry possible', async (name, kind) => {
    let fail = true
    const s = setup({ getUserMedia: () => (fail ? Promise.reject(namedError(name)) : Promise.resolve(new FakeStream() as unknown as MediaStream)) })
    await s.session.startCamera()
    const snap = s.session.store.get()
    expect(snap.status).toBe('error')
    expect(snap.error!.kind).toBe(kind)
    expect(snap.error!.message.length).toBeGreaterThan(20)
    await Promise.resolve()
    expect(s.detector.closed).toBe(true)
    fail = false
    await s.session.startCamera()
    expect(s.session.store.get().status).toBe('running')
  })

  it('model load failure releases the camera (never leaves it on without tracking)', async () => {
    const s = setup({ detectorFails: true })
    await s.session.startCamera()
    expect(s.session.store.get().status).toBe('error')
    expect(s.session.store.get().error!.title).toMatch(/model failed/i)
    expect(s.stream.track.stop).toHaveBeenCalled()
  })

  it('a detection exception stops tracking and releases the camera', async () => {
    const s = setup()
    await s.session.startCamera()
    s.detector.throwOnDetect = true
    s.frame()
    expect(s.session.store.get().status).toBe('error')
    expect(s.stream.track.stop).toHaveBeenCalled()
    expect(s.scheduler.count).toBe(0)
  })

  it('camera unplugged mid-session → clear error and release', async () => {
    const s = setup()
    await s.session.startCamera()
    s.stream.track.end()
    expect(s.session.store.get().status).toBe('error')
    expect(s.session.store.get().error!.title).toMatch(/disconnected/i)
    expect(s.detector.closed).toBe(true)
  })
})

describe('VisionSession — tab visibility', () => {
  it('pauses detection while the tab is hidden and resumes when visible', async () => {
    const s = setup()
    await s.session.startCamera()
    s.frame()
    s.doc.hidden = true
    s.doc.fire()
    expect(s.session.store.get().status).toBe('paused')
    expect(s.scheduler.count).toBe(0)
    s.doc.hidden = false
    s.doc.fire()
    expect(s.session.store.get().status).toBe('running')
    expect(s.scheduler.count).toBe(1)
  })
})

describe('VisionSession — tracking loss', () => {
  it('holds a hand briefly after the detector loses it, then reports it lost', async () => {
    const s = setup()
    await s.session.startCamera()
    s.frame(150)
    s.detector.script = () => result(rawHand('Left', 0.25))
    s.frame(150)
    expect(s.session.store.get().right.status).toBe('holding')
    s.frame(400)
    s.frame(150)
    expect(s.session.store.get().right.status).toBe('lost')
    expect(s.session.store.get().left.status).toBe('tracking')
  })
})

describe('VisionSession — sensitivity', () => {
  it('maps sensitivity to the detector threshold and applies it live', async () => {
    const s = setup()
    await s.session.startCamera()
    gestureSettings.set((c) => ({ ...c, tracking: { ...c.tracking, sensitivity: 1.5 } }))
    expect(s.detector.setMinConfidence.mock.lastCall![0]).toBeCloseTo(0.4, 6)
    expect(effectiveMinConfidence(gestureSettings.get())).toBeCloseTo(0.4)
  })
  it('clamps to a sensible range', () => {
    const c = (sens: number) => ({ ...DEFAULT_GESTURE_CONFIG, tracking: { ...DEFAULT_GESTURE_CONFIG.tracking, sensitivity: sens } })
    expect(effectiveMinConfidence(c(100))).toBe(0.2)
    expect(effectiveMinConfidence(c(0.1))).toBe(0.95)
  })
})

describe('VisionSession — demonstration mode', () => {
  it('needs no camera and no model, and is always marked as a demo source', () => {
    const s = setup()
    const frames: HandFrame[] = []
    s.session.onFrame((f) => f && frames.push(f))
    s.session.startDemo()
    s.frame()
    s.frame(150)
    expect(s.getUserMedia).not.toHaveBeenCalled()
    expect(s.createDetector).not.toHaveBeenCalled()
    expect(s.session.store.get()).toMatchObject({ status: 'running', source: 'demo' })
    expect(frames.every((f) => f.source === 'demo')).toBe(true)
    expect(frames.at(-1)!.left).not.toBeNull()
    expect(frames.at(-1)!.right).not.toBeNull()
  })

  it('does not allow calibration (it would calibrate synthetic hands)', () => {
    const s = setup()
    s.session.startDemo()
    s.session.startCalibration()
    expect(s.session.store.get().calibration.step).toBe('idle')
  })

  it('stop() ends the demo loop', () => {
    const s = setup()
    s.session.startDemo()
    s.session.stop()
    expect(s.scheduler.count).toBe(0)
    expect(s.session.store.get().status).toBe('idle')
  })
})

describe('VisionSession — calibration integration', () => {
  const cfg = { calibration: { ...DEFAULT_GESTURE_CONFIG.calibration, samplesPerHand: 3, rangeDurationMs: 1000 } }

  async function calibrate(labelForUsersRight: 'Left' | 'Right') {
    const labelForUsersLeft = labelForUsersRight === 'Left' ? 'Right' : 'Left'
    const s = setup({ config: cfg })
    await s.session.startCamera()
    s.session.startCalibration()
    expect(s.session.store.get().calibration.step).toBe('handedness-right')
    s.detector.script = () => result(rawHand(labelForUsersRight, 0.75))
    for (let i = 0; i < 3; i++) s.frame()
    expect(s.session.store.get().calibration.step).toBe('handedness-left')
    s.detector.script = () => result(rawHand(labelForUsersLeft, 0.25))
    for (let i = 0; i < 3; i++) s.frame()
    expect(s.session.store.get().calibration.step).toBe('range')
    return s
  }

  it('only starts with the live camera running', () => {
    const s = setup()
    s.session.startCalibration()
    expect(s.session.store.get().calibration.step).toBe('idle')
  })

  it('verifies "labels as reported" and persists the profile', async () => {
    const s = await calibrate('Right')
    let i = 0
    s.detector.script = () => {
      const w = Math.sin(i++ / 4) * 0.25
      return result(rawHand('Left', 0.25 + w, 0.5 + w), rawHand('Right', 0.75 - w, 0.5 - w))
    }
    for (let k = 0; k < 40; k++) s.frame()
    const snap = s.session.store.get()
    expect(snap.calibration.step).toBe('complete')
    expect(calibrationStore.get()!.handedness.swap).toBe(false)
    expect(snap.handedness).toMatchObject({ verified: true, swap: false, origin: 'calibration' })
  })

  it('detects reversed labels, applies the swap, and the pipeline then resolves hands correctly', async () => {
    const s = await calibrate('Left') // detector calls the user's RIGHT hand "Left"
    expect(s.session.store.get().handedness).toMatchObject({ swap: true, verified: true }) // applied immediately, before the range step ends
    const frames: HandFrame[] = []
    s.session.onFrame((f) => f && frames.push(f))
    let i = 0
    s.detector.script = () => {
      const w = Math.sin(i++ / 4) * 0.25
      // Detector mislabels: user's right hand (display right) reported "Left"; user's left reported "Right".
      return result(rawHand('Left', 0.75 - w, 0.5 - w), rawHand('Right', 0.25 + w, 0.5 + w))
    }
    for (let k = 0; k < 40; k++) s.frame()
    expect(calibrationStore.get()!.handedness.swap).toBe(true)
    const last = frames.at(-1)!
    expect(last.right!.palm.x).toBeGreaterThan(0.45) // user's right hand is on the right of the preview
    expect(last.left!.palm.x).toBeLessThan(0.55)
    expect(last.right!.labelSource).toBe('swapped')
  })

  it('without calibration, labels are NOT corrected and are flagged unverified', async () => {
    const s = setup()
    await s.session.startCamera()
    s.frame(150)
    expect(s.session.store.get().handedness).toMatchObject({ swap: false, verified: false })
  })

  it('cancel returns to idle; clearCalibration forgets the saved result', async () => {
    const s = await calibrate('Right')
    s.session.cancelCalibration()
    expect(s.session.store.get().calibration.step).toBe('idle')
    calibrationStore.set({ version: 1, createdAt: 1, handedness: { swap: true, observed: { right: 'Left', left: 'Right' }, agreement: { right: 1, left: 1 } }, ranges: { left: null, right: null }, warnings: [] })
    s.session.clearCalibration()
    expect(calibrationStore.get()).toBeNull()
    expect(s.session.store.get().handedness.verified).toBe(false)
  })
})

describe('VisionSession — store type', () => {
  it('exposes a complete snapshot shape', () => {
    const snap: VisionSnapshot = setup().session.store.get()
    expect(Object.keys(snap).sort()).toEqual(['assetOrigin', 'calibration', 'confidence', 'delegate', 'delegateNote', 'error', 'fps', 'handedness', 'inferenceMs', 'left', 'reliability', 'right', 'source', 'status', 'videoSize'])
  })
})

describe('VisionSession — slow GPU delegate', () => {
  const run = (s: ReturnType<typeof setup>, n: number) => {
    for (let i = 0; i < n; i++) s.frame(10)
  }

  it('switches once to the CPU delegate when the GPU delegate is persistently slow, and keeps tracking', async () => {
    const gpu = new FakeDetector()
    gpu.delegate = 'GPU'
    const cpu = new FakeDetector()
    const s = setup({ createDetector: (o) => Promise.resolve((o.delegate === 'CPU' ? cpu : gpu) as HandDetector) })
    gpu.clock = s.clock
    gpu.costMs = 200
    await s.session.startCamera()
    expect(s.session.store.get().delegate).toBe('GPU')
    run(s, 20)
    await Promise.resolve()
    await Promise.resolve()
    expect(s.createDetector).toHaveBeenCalledTimes(2)
    expect(s.createDetector.mock.calls[1][0]).toMatchObject({ delegate: 'CPU' })
    expect(gpu.closed).toBe(true)
    expect(s.session.store.get().delegate).toBe('CPU')
    expect(s.session.store.get().delegateNote).toMatch(/switched to the cpu delegate/i)
    const before = cpu.timestamps.length
    run(s, 3)
    expect(cpu.timestamps.length).toBe(before + 3) // frames now flow through the CPU detector
    run(s, 40)
    expect(s.createDetector).toHaveBeenCalledTimes(2) // never switches again
  })

  it('leaves a fast GPU delegate alone', async () => {
    const gpu = new FakeDetector()
    gpu.delegate = 'GPU'
    const s = setup({ createDetector: () => Promise.resolve(gpu as HandDetector) })
    gpu.clock = s.clock
    gpu.costMs = 8
    await s.session.startCamera()
    run(s, 40)
    expect(s.createDetector).toHaveBeenCalledTimes(1)
    expect(s.session.store.get().delegate).toBe('GPU')
  })

  it('keeps the working GPU detector if the CPU detector cannot be created', async () => {
    const gpu = new FakeDetector()
    gpu.delegate = 'GPU'
    const s = setup({ createDetector: (o) => (o.delegate === 'CPU' ? Promise.reject(new Error('no wasm')) : Promise.resolve(gpu as HandDetector)) })
    gpu.clock = s.clock
    gpu.costMs = 200
    await s.session.startCamera()
    run(s, 20)
    await Promise.resolve()
    await Promise.resolve()
    expect(gpu.closed).toBe(false)
    expect(s.session.store.get().status).toBe('running')
    run(s, 40)
    expect(s.createDetector).toHaveBeenCalledTimes(2) // tried once, not in a loop
  })

  it('closes the replacement detector if the session is stopped while it loads', async () => {
    const gpu = new FakeDetector()
    gpu.delegate = 'GPU'
    const cpu = new FakeDetector()
    let resolveCpu!: (d: HandDetector) => void
    const s = setup({ createDetector: (o) => (o.delegate === 'CPU' ? new Promise<HandDetector>((r) => (resolveCpu = r)) : Promise.resolve(gpu as HandDetector)) })
    gpu.clock = s.clock
    gpu.costMs = 200
    await s.session.startCamera()
    run(s, 20)
    s.session.stop()
    resolveCpu(cpu)
    await Promise.resolve()
    await Promise.resolve()
    expect(cpu.closed).toBe(true)
    expect(s.session.store.get().status).toBe('idle')
  })
})
