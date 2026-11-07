import { FakeStream, makeVideo, namedError } from '@/test/fakeMedia'
import { CameraController } from './camera'

const mdWith = (impl: (c: MediaStreamConstraints) => Promise<MediaStream>) => ({ getUserMedia: vi.fn(impl) })
const ok = (s = new FakeStream()) => mdWith(() => Promise.resolve(s as unknown as MediaStream))

describe('CameraController', () => {
  it('does nothing on construction — no permission request until start()', () => {
    const md = ok()
    new CameraController({ mediaDevices: md })
    expect(md.getUserMedia).not.toHaveBeenCalled()
  })

  it('requests video only (never audio), attaches the stream and reports the size', async () => {
    const md = ok()
    const cam = new CameraController({ mediaDevices: md, isSecureContext: true })
    const v = makeVideo(640, 480)
    const info = await cam.start(v)
    expect(md.getUserMedia).toHaveBeenCalledTimes(1)
    expect(md.getUserMedia.mock.calls[0][0]).toMatchObject({ audio: false, video: { facingMode: 'user' } })
    expect(v.srcObject).not.toBeNull()
    expect(v.muted).toBe(true)
    expect(info).toMatchObject({ width: 640, height: 480 })
    expect(cam.active).toBe(true)
  })

  it('stop() releases the hardware: tracks stopped, srcObject cleared, ended-listener removed', async () => {
    const stream = new FakeStream()
    const cam = new CameraController({ mediaDevices: ok(stream), isSecureContext: true })
    const v = makeVideo()
    await cam.start(v, () => undefined)
    expect(stream.track.listenerCount('ended')).toBe(1)
    cam.stop()
    expect(stream.track.stop).toHaveBeenCalled()
    expect(v.srcObject).toBeNull()
    expect(stream.track.listenerCount('ended')).toBe(0)
    expect(cam.active).toBe(false)
    cam.stop() // idempotent
  })

  it('releases a stream that arrives AFTER stop() (permission-prompt race)', async () => {
    const stream = new FakeStream()
    let resolve!: (s: MediaStream) => void
    const md = mdWith(() => new Promise<MediaStream>((r) => (resolve = r)))
    const cam = new CameraController({ mediaDevices: md, isSecureContext: true })
    const p = cam.start(makeVideo())
    cam.stop()
    resolve(stream as unknown as MediaStream)
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(stream.track.stop).toHaveBeenCalled()
    expect(cam.active).toBe(false)
  })

  it('notifies when the camera disappears (track ended)', async () => {
    const stream = new FakeStream()
    const onEnded = vi.fn()
    await new CameraController({ mediaDevices: ok(stream), isSecureContext: true }).start(makeVideo(), onEnded)
    stream.track.end()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('retries with relaxed constraints when the preferred ones are not supported', async () => {
    const stream = new FakeStream()
    let n = 0
    const md = mdWith(() => (n++ === 0 ? Promise.reject(namedError('OverconstrainedError')) : Promise.resolve(stream as unknown as MediaStream)))
    await new CameraController({ mediaDevices: md, isSecureContext: true }).start(makeVideo())
    expect(md.getUserMedia).toHaveBeenCalledTimes(2)
    expect(md.getUserMedia.mock.calls[1][0]).toEqual({ video: true, audio: false })
  })

  it('propagates permission errors untouched', async () => {
    const md = mdWith(() => Promise.reject(namedError('NotAllowedError')))
    await expect(new CameraController({ mediaDevices: md, isSecureContext: true }).start(makeVideo())).rejects.toMatchObject({ name: 'NotAllowedError' })
  })

  it('rejects on insecure contexts and when getUserMedia is missing', async () => {
    await expect(new CameraController({ mediaDevices: ok(), isSecureContext: false }).start(makeVideo())).rejects.toMatchObject({ name: 'CameraInsecureContext' })
    await expect(new CameraController({ mediaDevices: {} as never, isSecureContext: true }).start(makeVideo())).rejects.toMatchObject({ name: 'CameraUnsupported' })
  })

  it('releases the stream if the video element cannot start playing', async () => {
    const stream = new FakeStream()
    const v = makeVideo()
    v.play = vi.fn().mockRejectedValue(new Error('autoplay'))
    await expect(new CameraController({ mediaDevices: ok(stream), isSecureContext: true }).start(v)).rejects.toBeTruthy()
    expect(stream.track.stop).toHaveBeenCalled()
  })
})
