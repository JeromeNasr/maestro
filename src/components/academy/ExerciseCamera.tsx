import { useEffect, useRef } from 'react'
import type { GestureInput } from '@/conducting/gestureInput'
import { useStore } from '@/lib/store'
import { drawHands, type OverlayContext } from '@/vision/overlay'

/** Camera preview with the hand skeleton for Academy exercises (the camera is requested only by its button). */
export function ExerciseCamera({ input }: { input: GestureInput }) {
  const session = input.vision
  const snap = useStore(session.store)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
  const live = snap.status === 'running' && snap.source === 'camera'
  const busy = ['requesting-permission', 'loading-model', 'running', 'paused'].includes(snap.status)
  return (
    <div>
      <div className="relative max-w-md overflow-hidden rounded-sm border hairline bg-ink-950" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <video ref={videoRef} muted playsInline aria-label="Camera preview" className={`absolute inset-0 h-full w-full -scale-x-100 object-fill ${live ? '' : 'invisible'}`} />
        <canvas ref={canvasRef} width={size.width} height={size.height} aria-hidden="true" className="absolute inset-0 h-full w-full" />
        {!live && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-ivory-dim">
            {snap.status === 'requesting-permission' ? 'Waiting for camera permission…' : snap.status === 'loading-model' ? 'Loading hand-tracking model…' : 'Camera is off. It is requested only when you press Enable camera; video stays in your browser.'}
          </div>
        )}
      </div>
      {snap.status === 'error' && snap.error && <p role="alert" className="mt-2 max-w-md text-sm text-gold-soft">{snap.error.title}. {snap.error.message}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {busy ? (
          <button className="btn btn-ghost !py-2" onClick={() => session.stop()}>Stop camera</button>
        ) : (
          <button className="btn btn-gold !py-2" onClick={() => void session.startCamera()}>{snap.status === 'error' ? 'Try again' : 'Enable camera'}</button>
        )}
        {live && <span className="text-xs text-ivory-mute">Left {snap.left.status === 'tracking' ? '✓' : '—'} · Right {snap.right.status === 'tracking' ? '✓' : '—'}</span>}
      </div>
    </div>
  )
}
