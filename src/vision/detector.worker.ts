/**
 * Hand-landmark detection off the main thread. The main thread transfers one video frame at a time (as an
 * ImageBitmap); this worker runs MediaPipe and posts back the landmarks. Keeping ~50–80 ms of inference per frame off
 * the main thread is what keeps the UI and the audio scheduler responsive (measured: see CLAUDE.md).
 */
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { confidenceTriplet, isAllowedUrl, type FromWorker, type ToWorker } from './detectorProtocol'
import type { ReportedLabel } from './types'

type Scope = { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null; location: Location; fetch: typeof fetch; XMLHttpRequest: typeof XMLHttpRequest; navigator: Navigator }
const scope = self as unknown as Scope

const mpConfidence = (c: number) => {
  const t = confidenceTriplet(c)
  return { minHandDetectionConfidence: t.detection, minHandPresenceConfidence: t.presence, minTrackingConfidence: t.tracking }
}

let landmarker: HandLandmarker | null = null
let allowed: string[] = []

/** Refuse network requests to anywhere but the allow-list (see isAllowedUrl). */
function installEgressGuard() {
  const self_ = scope.location.origin
  const origFetch = scope.fetch.bind(scope)
  scope.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (!isAllowedUrl(url, self_, allowed)) return Promise.reject(new TypeError(`Blocked by MAESTRO: requests to ${new URL(url, self_).origin} are not allowed.`))
    return origFetch(input, init)
  }) as typeof fetch
  const origOpen = scope.XMLHttpRequest.prototype.open
  scope.XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    if (!isAllowedUrl(String(url), self_, allowed)) throw new TypeError('Blocked by MAESTRO: request not allowed.')
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest)
  } as typeof origOpen
  if (scope.navigator && 'sendBeacon' in scope.navigator) scope.navigator.sendBeacon = () => false
}

async function init(m: Extract<ToWorker, { type: 'init' }>) {
  allowed = m.allowedOrigins
  installEgressGuard()
  const fileset = await FilesetResolver.forVisionTasks(m.assets.wasmBase)
  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: m.assets.modelUrl, delegate }, runningMode: 'VIDEO', numHands: 2,
      ...mpConfidence(m.minConfidence),
    })
  let delegate: 'GPU' | 'CPU' = 'CPU'
  if (m.delegate === 'CPU') landmarker = await make('CPU')
  else {
    try {
      landmarker = await make('GPU')
      delegate = 'GPU'
    } catch {
      landmarker = await make('CPU')
    }
  }
  scope.postMessage({ type: 'ready', delegate })
}

scope.onmessage = async (e) => {
  const m = e.data
  try {
    if (m.type === 'init') await init(m)
    else if (m.type === 'detect') {
      if (!landmarker) throw new Error('Detector not initialised')
      const r = landmarker.detectForVideo(m.bitmap, m.ts)
      m.bitmap.close()
      const hands = r.landmarks.flatMap((lm, i) => {
        const cat = r.handedness?.[i]?.[0]
        return cat ? [{ landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z })), label: cat.categoryName as ReportedLabel, score: cat.score }] : []
      })
      scope.postMessage({ type: 'result', id: m.id, result: { hands } })
    } else if (m.type === 'setMinConfidence') {
      void landmarker?.setOptions(mpConfidence(m.value))
    } else if (m.type === 'close') {
      landmarker?.close()
      landmarker = null
    }
  } catch (err) {
    if (m.type === 'detect') m.bitmap.close()
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err), id: m.type === 'detect' ? m.id : undefined })
  }
}
