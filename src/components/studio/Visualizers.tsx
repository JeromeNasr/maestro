import { SECTIONS } from '@/orchestra/sections'
import { PhaseTag } from '@/components/ui/StatusTag'

import { DYNAMIC_MARKS, markForLevel } from '@/gesture/dynamicsMapper'

/** Dynamics scale. `level` is 0–1, or null when no hand is tracked (idle state). */
export function DynamicsMeter({ level = null }: { level?: number | null }) {
  const active = level === null ? -1 : DYNAMIC_MARKS.indexOf(markForLevel(level))
  return (
    <div role="img" aria-label={level === null ? 'Dynamics: no data' : `Dynamics level ${DYNAMIC_MARKS[active]}`}>
      <div className="flex items-end gap-1.5">
        {DYNAMIC_MARKS.map((m, i) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-16 w-full items-end">
              <div
                className={`w-full rounded-sm transition-all duration-300 ${i <= active ? 'bg-gold' : 'bg-ink-600'}`}
                style={{ height: `${28 + i * 14}%` }}
              />
            </div>
            <span className={`font-serif text-sm italic ${i === active ? 'text-gold' : 'text-ivory-mute'}`}>{m}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Beat pulse: `beatKey` changes on each beat to retrigger the animation. Idle when undefined. */
export function BeatPulse({ beatKey }: { beatKey?: number }) {
  return (
    <div className="relative flex h-24 items-center justify-center" role="img" aria-label="Beat indicator">
      {beatKey !== undefined && (
        <span key={beatKey} className="absolute h-10 w-10 animate-pulseRing rounded-full border border-gold" />
      )}
      <span className={`h-5 w-5 rounded-full ${beatKey !== undefined ? 'bg-gold' : 'bg-ink-600'}`} />
    </div>
  )
}

export function OrchestraActivity({ levels }: { levels?: Record<string, number> }) {
  return (
    <ul className="space-y-2" aria-label="Section activity">
      {SECTIONS.map((s) => {
        const v = levels?.[s.id] ?? 0
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span className="w-[72px] shrink-0 text-[11px] text-ivory-mute">{s.label}</span>
            <div className="h-3 min-w-0 flex-1 rounded-sm bg-ink-700">
              <div className="h-full rounded-sm bg-bronze transition-all duration-150" style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function TrajectoryPlaceholder() {
  return (
    <div className="flex h-24 items-center justify-center rounded-sm border border-dashed border-ivory/15 text-xs text-ivory-mute">
      No hand movement tracked
    </div>
  )
}

export function VisualFeedback() {
  const cell = 'space-y-2'
  const label = 'text-[11px] uppercase tracking-widest text-ivory-mute'
  return (
    <section className="panel p-4" aria-labelledby="vf-h">
      <header className="flex items-center justify-between">
        <h2 id="vf-h" className="font-sans text-sm font-medium tracking-wide">Visual feedback</h2>
        <PhaseTag phase={5} />
      </header>
      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cell}><p className={label}>Beat</p><BeatPulse /></div>
        <div className={cell}><p className={label}>Trajectory</p><TrajectoryPlaceholder /></div>
        <div className={cell}><p className={label}>Dynamics</p><DynamicsMeter /></div>
        <div className={cell}><p className={label}>Sections</p><OrchestraActivity /></div>
      </div>
    </section>
  )
}
