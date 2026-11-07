import { CameraStartError } from './cameraErrors'

export interface CameraDeps {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'> | undefined
  isSecureContext?: boolean
}

export interface CameraInfo { width: number; height: number; label: string }

const PREFERRED: MediaStreamConstraints = {
  video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
  audio: false,
}
const RELAXED: MediaStreamConstraints = { video: true, audio: false }

/**
 * Owns the MediaStream lifecycle. It never requests access until `start()` is called, and `stop()` releases the
 * hardware (every track stopped, `srcObject` cleared). Safe against start/stop races: a stream that arrives after
 * `stop()` is released immediately.
 */
export class CameraController {
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private generation = 0
  private endedCleanup: (() => void) | null = null

  constructor(private deps: CameraDeps = {}) {}

  get active(): boolean {
    return this.stream !== null
  }

  async start(video: HTMLVideoElement, onEnded?: () => void): Promise<CameraInfo> {
    this.stop()
    const gen = ++this.generation
    const md = this.deps.mediaDevices ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined)
    const secure = this.deps.isSecureContext ?? (typeof window !== 'undefined' ? window.isSecureContext !== false : true)
    if (!secure) throw new CameraStartError('CameraInsecureContext')
    if (!md?.getUserMedia) throw new CameraStartError('CameraUnsupported')

    let stream: MediaStream
    try {
      stream = await md.getUserMedia(PREFERRED)
    } catch (e) {
      const name = (e as { name?: string })?.name
      if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') stream = await md.getUserMedia(RELAXED)
      else throw e
    }
    if (gen !== this.generation) {
      // stop() (or a newer start()) happened while the permission prompt/stream was pending.
      stream.getTracks().forEach((t) => t.stop())
      throw new CameraStartError('AbortError', 'Camera start was cancelled')
    }

    this.stream = stream
    this.video = video
    video.muted = true
    video.playsInline = true
    video.srcObject = stream

    const track = stream.getVideoTracks()[0]
    if (track && onEnded) {
      const handler = () => onEnded()
      track.addEventListener('ended', handler)
      this.endedCleanup = () => track.removeEventListener('ended', handler)
    }

    try {
      await video.play()
      if (!video.videoWidth) await waitForMetadata(video, 8000)
    } catch (e) {
      if (gen === this.generation) this.stop()
      throw e instanceof CameraStartError ? e : new CameraStartError('NotReadableError', 'Video could not start')
    }
    if (gen !== this.generation) throw new CameraStartError('AbortError', 'Camera start was cancelled')
    return { width: video.videoWidth, height: video.videoHeight, label: track?.label ?? '' }
  }

  stop() {
    this.generation++
    this.endedCleanup?.()
    this.endedCleanup = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.video) {
      this.video.pause?.()
      this.video.srcObject = null
      this.video = null
    }
  }
}

function waitForMetadata(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.videoWidth) return resolve()
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', done)
      resolve()
    }
    const timer = setTimeout(() => {
      video.removeEventListener('loadedmetadata', done)
      reject(new CameraStartError('NotReadableError', 'Timed out waiting for video'))
    }, timeoutMs)
    video.addEventListener('loadedmetadata', done)
  })
}
