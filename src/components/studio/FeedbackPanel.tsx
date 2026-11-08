import type { ConductingSession } from '@/conducting/conductingSession'
import { beatsPerBar } from '@/gesture/directions'
import { BeatPulse, DynamicsMeter, SectionLevels } from './Visualizers'
import { TrajectoryCanvas } from './TrajectoryCanvas'
import { useAudio, useGesture, useStudio } from './useConductingSession'

/** Plain-language reasons a stroke was seen but not counted, with what to change. */
export const REJECT_HINT: Record<string, string> = {
  'too-small': 'That movement was too small to count as a beat. Make the stroke a little bigger and keep it steady — or raise sensitivity in Tuning.',
  'too-slow': 'That stroke was too slow or too long. Move a little faster and stop clearly at the bottom (the ictus).',
  'too-brief': 'That stroke was too quick to read. Slow it down slightly.',
  'too-soon': 'Two strokes came very close together. Give one clear stroke per beat.',
  'off-pattern': 'That direction does not fit the pattern. Follow the shape shown in the Trajectory panel.',
  'awaiting-downbeat': 'Start with a clear downward stroke: that is beat 1.',
}

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
      {studio.lastReject && g.timestampMs - studio.lastReject.atMs < 3000 && g.timestampMs >= studio.lastReject.atMs && (
        <p role="status" className="mt-3 text-xs text-gold-soft" data-testid="gesture-hint">{REJECT_HINT[studio.lastReject.reason]}</p>
      )}
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
