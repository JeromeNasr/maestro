import type { SideTracking } from '@/vision/types'
import type { VisionSnapshot } from '@/vision/visionSession'
import { StatusTag } from '@/components/ui/StatusTag'

function describe(s: SideTracking): { text: string; tone: string } {
  if (s.status === 'tracking') return { text: `Tracking · ${Math.round(s.confidence * 100)}%`, tone: 'text-gold' }
  if (s.status === 'holding') return { text: `Signal lost · holding ${(s.lostForMs / 1000).toFixed(1)}s`, tone: 'text-gold-soft' }
  return { text: 'Not detected', tone: 'text-ivory-mute' }
}

export function handednessText(h: VisionSnapshot['handedness']): string {
  switch (h.origin) {
    case 'calibration': return h.swap ? 'Verified by calibration — labels swapped' : 'Verified by calibration — labels as reported'
    case 'user-as-reported': return 'Manual: labels as reported'
    case 'user-swapped': return 'Manual: labels swapped'
    case 'demo': return 'Demonstration'
    default: return 'Not verified — run Calibrate to check left/right'
  }
}

export function TrackingStatus({ snap }: { snap: VisionSnapshot }) {
  const live = snap.status === 'running' || snap.status === 'paused'
  const l = describe(snap.left)
  const r = describe(snap.right)
  return (
    <div className="space-y-2 border-t hairline px-4 py-3 text-xs" aria-label="Tracking status">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="text-ivory-mute">Left hand <span data-testid="left-status" className={`ml-1 ${live ? l.tone : 'text-ivory-mute'}`}>{live ? l.text : '—'}</span></span>
        <span className="text-ivory-mute">Right hand <span data-testid="right-status" className={`ml-1 ${live ? r.tone : 'text-ivory-mute'}`}>{live ? r.text : '—'}</span></span>
        {snap.status === 'paused' && <StatusTag kind="neutral">Paused (tab hidden)</StatusTag>}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-ivory-mute">
        <span>
          Left/right labels:{' '}
          <span data-testid="handedness-status" className={snap.handedness.verified ? 'text-ivory-dim' : 'text-gold-soft'}>{handednessText(snap.handedness)}</span>
        </span>
        {live && snap.source === 'camera' && (
          <span data-testid="perf-status">
            {snap.fps ? `${snap.fps.toFixed(0)} fps` : '… fps'} · {snap.inferenceMs ? `${snap.inferenceMs.toFixed(0)} ms inference` : '… ms'} · {snap.delegate} · model: {snap.assetOrigin === 'cdn' ? 'CDN' : 'local'} <StatusTag kind="measured" />
          </span>
        )}
      </div>
      {snap.delegateNote && <p role="status" className="text-gold-soft">{snap.delegateNote}</p>}
    </div>
  )
}
