import type { ConductingSession } from '@/conducting/conductingSession'
import { beatsPerBar } from '@/gesture/directions'
import { BeatPulse, DynamicsMeter, SectionLevels } from './Visualizers'
import { TrajectoryCanvas } from './TrajectoryCanvas'
import { useAudio, useGesture, useStudio } from './useConductingSession'

const label = 'text-[11px] uppercase tracking-widest text-ivory-mute'

/** Visual feedback, all driven by real data: detected beats, the right-hand path, the left-hand dynamics and section output. */
export function FeedbackPanel({ session }: { session: ConductingSession }) {
  const studio = useStudio(session)
  const g = useGesture(session)
  const a = useAudio(session)
  const cue = g.cue
  return (
    <section className="panel p-4" aria-labelledby="vf-h">
      <header className="flex items-center justify-between gap-2">
        <h2 id="vf-h" className="font-sans text-sm font-medium tracking-wide">Visual feedback</h2>
        {cue.cue && cue.progress > 0 && (
          <span role="status" className="text-xs text-gold-soft" data-testid="cue-progress">
            Hold to {cue.cue}… {Math.round(cue.progress * 100)}%
          </span>
        )}
      </header>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <p className={label}>Beat</p>
          <BeatPulse beats={beatsPerBar(studio.timeSignature)} beat={studio.lastBeat?.beatInBar ?? null} seq={studio.lastBeat?.seq ?? null} confident={studio.lastBeat?.usedForTempo ?? true} />
        </div>
        <div className="space-y-2">
          <p className={label}>Trajectory (right hand)</p>
          <TrajectoryCanvas input={session.gesture} timeSignature={studio.timeSignature} />
        </div>
        <div className="space-y-2">
          <p className={label}>Dynamics (left hand)</p>
          <DynamicsMeter level={g.dynamics.source === 'default' && !g.leftPresent ? null : g.dynamics.level} trend={g.dynamics.trend} />
        </div>
        <div className="space-y-2">
          <p className={label}>Sections</p>
          <SectionLevels levels={a.levels} />
        </div>
      </div>
    </section>
  )
}
