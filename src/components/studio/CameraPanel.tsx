import { useEffect, useRef } from 'react'
import { StatusTag } from '@/components/ui/StatusTag'
import { gestureSettings } from '@/config/settings'
import { useStore } from '@/lib/store'
import { drawHands, type OverlayContext } from '@/vision/overlay'
import type { ConductingSession } from '@/conducting/conductingSession'
import { CalibrationPanel } from './CalibrationPanel'
import { TrackingStatus } from './TrackingStatus'
import { useVision } from './useConductingSession'

const CAMERA_BUSY = ['requesting-permission', 'loading-model', 'running', 'paused']

export function CameraPanel({ conducting }: { conducting: ConductingSession }) {
  const session = conducting.vision
  const snap = useVision(conducting)
  const cfg = useStore(gestureSettings)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Hand the <video> to the session (it owns the stream) and subscribe the canvas to per-frame results.
  useEffect(() => {
    session.attachVideo(videoRef.current)
    const unsub = session.onFrame((frame) => {
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (c && ctx) drawHands(ctx as unknown as OverlayContext, frame, c.width, c.height)
    })
    return () => {
      unsub()
      session.attachVideo(null)
    }
  }, [session])

  const size = snap.videoSize ?? { width: 640, height: 480 }
  useEffect(() => {
    const c = canvasRef.current
    if (c && (c.width !== size.width || c.height !== size.height)) {
      c.width = size.width
      c.height = size.height
    }
  }, [size.width, size.height])

  const status = snap.status
  const isCamera = snap.source === 'camera'
  const isDemo = snap.source === 'demo' && status === 'running'
  const cameraBusy = CAMERA_BUSY.includes(status) && isCamera
  const running = status === 'running' && isCamera
  const calActive = snap.calibration.step !== 'idle'

  return (
    <section className="panel overflow-hidden" aria-labelledby="cam-h">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b hairline px-4 py-3">
        <h2 id="cam-h" className="font-sans text-sm font-medium tracking-wide">Camera &amp; hand tracking</h2>
        {isDemo ? <StatusTag kind="demo">Demonstration · synthetic hands</StatusTag> : running ? <StatusTag kind="measured">Live camera</StatusTag> : <StatusTag kind="phase">Camera off</StatusTag>}
      </header>

      <div className="relative bg-ink-950" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        {/* Mirrored preview. The overlay canvas is NOT mirrored: landmarks are already in display (mirrored) space. */}
        <video ref={videoRef} muted playsInline aria-label="Camera preview" className={`absolute inset-0 h-full w-full -scale-x-100 object-fill ${isCamera && (status === 'running' || status === 'paused') ? '' : 'invisible'}`} />
        <canvas ref={canvasRef} width={size.width} height={size.height} aria-hidden="true" className="absolute inset-0 h-full w-full" />

        {isDemo && (
          <div className="absolute inset-0 -z-0 bg-[linear-gradient(rgba(196,163,90,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(196,163,90,.06)_1px,transparent_1px)] bg-[size:10%_10%]" aria-hidden="true" />
        )}
        {isDemo && (
          <p className="absolute left-3 top-3 rounded-sm border border-bronze bg-ink-950/80 px-2 py-1 text-[11px] uppercase tracking-widest text-bronze">
            Demonstration — synthetic hands, not detected from a camera
          </p>
        )}

        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-serif text-2xl text-ivory">Camera is off</p>
            <p className="max-w-sm text-sm text-ivory-dim">
              The camera is requested only when you press Enable camera. Video is processed in your browser and is never uploaded.
            </p>
          </div>
        )}
        {(status === 'requesting-permission' || status === 'loading-model') && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950/70 p-6 text-center">
            <p className="font-serif text-2xl">{status === 'requesting-permission' ? 'Waiting for camera permission…' : 'Loading hand-tracking model…'}</p>
            <p className="max-w-sm text-sm text-ivory-dim">
              {status === 'requesting-permission' ? 'Your browser should be asking you to allow camera access.' : 'First load can take a few seconds. Processing stays on this device.'}
            </p>
          </div>
        )}
        {status === 'error' && snap.error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-950/90 p-6 text-center">
            <p className="font-serif text-2xl">{snap.error.title}</p>
            <p className="max-w-md text-sm leading-relaxed text-ivory-dim">{snap.error.message}</p>
          </div>
        )}
        {running && !snap.left.confidence && !snap.right.confidence && snap.left.status === 'lost' && snap.right.status === 'lost' && !calActive && (
          <p role="status" className="absolute inset-x-0 bottom-3 text-center text-xs uppercase tracking-widest text-ivory-mute">No hands detected — raise your hands into view</p>
        )}

        <CalibrationPanel state={snap.calibration} onCancel={() => session.cancelCalibration()} onRetry={() => session.startCalibration()} />
      </div>

      <TrackingStatus snap={snap} />

      <div className="flex flex-wrap items-center gap-3 border-t hairline p-4">
        {cameraBusy || status === 'error' && isCamera ? (
          <button className="btn btn-ghost" onClick={() => session.stop()}>{status === 'error' ? 'Dismiss' : 'Stop camera'}</button>
        ) : null}
        {!cameraBusy && (
          <button className="btn btn-gold" disabled={isDemo || status === 'requesting-permission'} onClick={() => void session.startCamera()}>
            {status === 'error' ? 'Try again' : 'Enable camera'}
          </button>
        )}
        <button
          className="btn btn-ghost"
          disabled={!running}
          title={running ? undefined : 'Calibration needs the live camera'}
          onClick={() => (calActive ? session.cancelCalibration() : session.startCalibration())}
        >
          {calActive ? 'Cancel calibration' : 'Calibrate'}
        </button>
        {snap.handedness.origin === 'calibration' && !calActive && (
          <button className="btn btn-ghost" onClick={() => session.clearCalibration()} title="Forget the saved left/right validation and hand ranges">
            Clear calibration
          </button>
        )}
        {isDemo ? (
          <button className="btn btn-ghost" onClick={() => session.stop()}>Stop demo</button>
        ) : (
          <button className="btn btn-ghost" disabled={cameraBusy} title={cameraBusy ? 'Stop the camera to use the virtual conductor' : 'A simulated conductor drives the music — no camera needed'} onClick={() => conducting.startDemo()}>
            Virtual conductor
          </button>
        )}
        <label className="ml-auto flex items-center gap-3 text-xs text-ivory-mute">
          Sensitivity
          <input
            type="range" min={0.5} max={1.5} step={0.05} value={cfg.tracking.sensitivity}
            onChange={(e) => gestureSettings.set((c) => ({ ...c, tracking: { ...c.tracking, sensitivity: Number(e.target.value) } }))}
            aria-label="Tracking sensitivity" aria-valuetext={`${cfg.tracking.sensitivity.toFixed(2)}× — detection threshold ${Math.round((cfg.tracking.minDetectionConfidence / cfg.tracking.sensitivity) * 100)}%`}
            className="accent-gold"
          />
          <span className="w-9 tabular-nums text-ivory-dim">{cfg.tracking.sensitivity.toFixed(2)}×</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-ivory-mute">
          Left/right labels
          <select
            value={cfg.tracking.handednessMode}
            onChange={(e) => gestureSettings.set((c) => ({ ...c, tracking: { ...c.tracking, handednessMode: e.target.value as typeof c.tracking.handednessMode } }))}
            className="rounded-sm border border-ivory/15 bg-ink-900 px-2 py-1 text-ivory-dim"
          >
            <option value="auto">Auto (verify by calibration)</option>
            <option value="as-reported">Force: as reported</option>
            <option value="swapped">Force: swapped</option>
          </select>
        </label>
      </div>
    </section>
  )
}
