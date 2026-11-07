import { CameraPanel } from '@/components/studio/CameraPanel'
import { ConductingPanel } from '@/components/studio/ConductingPanel'
import { DemoConductorPanel } from '@/components/studio/DemoConductorPanel'
import { EmergencyBar } from '@/components/studio/EmergencyBar'
import { FeedbackPanel } from '@/components/studio/FeedbackPanel'
import { LiveReadout } from '@/components/studio/LiveReadout'
import { MixerPanel } from '@/components/studio/MixerPanel'
import { SessionSummary } from '@/components/studio/SessionSummary'
import { StudioHeader } from '@/components/studio/StudioHeader'
import { TransportPanel } from '@/components/studio/TransportPanel'
import { useConductingSession, useStudio } from '@/components/studio/useConductingSession'

/** The conducting studio: camera → hand tracking → gestures → conductor bridge → orchestra, with live feedback. */
export function Studio() {
  const session = useConductingSession()
  const s = useStudio(session)
  return (
    <section className="mx-auto max-w-[1500px] px-4 py-6 pb-28 sm:px-6">
      <StudioHeader session={session} />

      {s.notice && (
        <p role="status" className="mb-5 flex items-start justify-between gap-3 border-l-2 border-bronze bg-ink-900 px-4 py-3 text-sm text-ivory-dim">
          <span>{s.notice}</span>
          <button className="shrink-0 text-xs text-ivory-mute hover:text-gold-soft" onClick={() => session.dismissNotice()}>Dismiss</button>
        </p>
      )}
      {s.summary && <div className="mb-5"><SessionSummary record={s.summary} onDismiss={() => session.dismissSummary()} /></div>}
      {s.summaryNote && !s.summary && <p role="status" className="mb-5 border-l-2 border-bronze bg-ink-900 px-4 py-3 text-sm text-ivory-dim">{s.summaryNote}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-5">
          <CameraPanel conducting={session} />
          <LiveReadout session={session} />
          <FeedbackPanel session={session} />
        </div>
        <div className="min-w-0 space-y-5">
          <TransportPanel session={session} />
          <MixerPanel session={session} />
          <DemoConductorPanel session={session} />
          <ConductingPanel session={session} />
        </div>
      </div>
      <EmergencyBar session={session} />
    </section>
  )
}
