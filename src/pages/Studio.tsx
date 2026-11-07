import { Link } from 'react-router'
import { getComposition } from '@/library/compositions'
import { selectedCompositionId } from '@/library/selection'
import { useStore } from '@/lib/store'
import { CameraPanel } from '@/components/studio/CameraPanel'
import { PerformanceReadout } from '@/components/studio/PerformanceReadout'
import { SectionMixer } from '@/components/studio/SectionMixer'
import { TransportControls } from '@/components/studio/TransportControls'
import { VisualFeedback } from '@/components/studio/Visualizers'
import { useVisionSession, useVisionSnapshot } from '@/components/studio/useVisionSession'

export function Studio() {
  const composition = getComposition(useStore(selectedCompositionId))
  const session = useVisionSession()
  const snap = useVisionSnapshot(session)
  const live = snap.status === 'running' && snap.source === 'camera' && (snap.left.status !== 'lost' || snap.right.status !== 'lost')
  return (
    <section className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Conducting studio</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">{composition?.title ?? 'No composition selected'}</h1>
          {composition && (
            <p className="text-sm text-ivory-dim">{composition.composer} · {composition.timeSignature} · {composition.difficulty}</p>
          )}
        </div>
        <Link to="/library" className="btn btn-ghost !py-2">Change composition</Link>
      </div>

      <p role="status" className="mb-5 border-l-2 border-bronze bg-ink-900 px-4 py-3 text-sm text-ivory-dim">
        <strong className="font-medium text-ivory">Phase 2: camera and hand tracking.</strong> Camera, hand tracking and calibration are implemented. Gestures, tempo, dynamics and audio are not, so those controls stay disabled and show no data.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-5">
          <CameraPanel session={session} />
          <PerformanceReadout composition={composition} trackingConfidence={live ? snap.confidence : null} />
          <VisualFeedback />
        </div>
        <div className="min-w-0 space-y-5">
          <TransportControls />
          <SectionMixer />
        </div>
      </div>
    </section>
  )
}
