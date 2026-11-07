import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { resolveAssets, type AssetLocation } from './assetLoader'
import type { DetectorFactory, DetectorOptions, HandDetector } from './detector'
import { WorkerHandDetector, withFallback } from './workerDetector'
import type { DetectionResult, ReportedLabel } from './types'

/** Real detector backed by MediaPipe Hand Landmarker. Loaded lazily so the library stays out of the initial bundle. */
export class MediaPipeHandDetector implements HandDetector {
  private constructor(
    private landmarker: HandLandmarker,
    readonly delegate: 'GPU' | 'CPU',
    readonly assetOrigin: AssetLocation['origin'],
  ) {}

  static async create(opts: DetectorOptions & { assets?: AssetLocation }): Promise<MediaPipeHandDetector> {
    const assets = opts.assets ?? (await resolveAssets(undefined, import.meta.env.BASE_URL))
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(assets.wasmBase)
    const make = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: assets.modelUrl, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: opts.minConfidence,
        minHandPresenceConfidence: opts.minConfidence,
        minTrackingConfidence: opts.minConfidence,
      })
    if (opts.delegate === 'CPU') return new MediaPipeHandDetector(await make('CPU'), 'CPU', assets.origin)
    try {
      return new MediaPipeHandDetector(await make('GPU'), 'GPU', assets.origin)
    } catch {
      // No usable WebGL/GPU: fall back to the CPU (WASM) delegate.
      return new MediaPipeHandDetector(await make('CPU'), 'CPU', assets.origin)
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): DetectionResult {
    const r = this.landmarker.detectForVideo(video, timestampMs)
    const hands: DetectionResult['hands'] = []
    r.landmarks.forEach((landmarks, i) => {
      const cat = r.handedness?.[i]?.[0]
      if (!cat) return
      hands.push({ landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })), label: cat.categoryName as ReportedLabel, score: cat.score })
    })
    return { hands }
  }

  setMinConfidence(c: number) {
    void this.landmarker.setOptions({ minHandDetectionConfidence: c, minHandPresenceConfidence: c, minTrackingConfidence: c })
  }

  close() {
    this.landmarker.close()
  }
}

/** Main-thread detector (used when a worker is unavailable). */
export const createMainThreadDetector: DetectorFactory = (o) => MediaPipeHandDetector.create(o)

/** The app's detector: a Web Worker (keeps the UI and audio responsive), falling back to the main thread. */
export const createMediaPipeDetector: DetectorFactory = withFallback((o) => WorkerHandDetector.create(o), createMainThreadDetector)
