import { SECTIONS } from '@/orchestra/sections'
import { DYNAMIC_MARKS, markForLevel } from '@/gesture/dynamicsMapper'
import type { DynamicsTrend } from '@/gesture/types'

/** Dynamics scale. `level` is 0–1, or null when there is no data (idle). Bars up to the current marking are lit. */
export function DynamicsMeter({ level = null, trend = 'steady' }: { level?: number | null; trend?: DynamicsTrend }) {
  const active = level === null ? -1 : DYNAMIC_MARKS.indexOf(markForLevel(level))
  return (
    <div role="img" aria-label={level === null ? 'Dynamics: no data' : `Dynamics ${DYNAMIC_MARKS[active]}${trend === 'steady' ? '' : `, ${trend}`}`}>
      <div className="flex items-end gap-1.5">
        {DYNAMIC_MARKS.map((m, i) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-16 w-full items-end">
              <div className={`w-full rounded-sm transition-all duration-300 ${i <= active ? 'bg-gold' : 'bg-ink-600'}`} style={{ height: `${28 + i * 14}%` }} />
            </div>
            <span className={`font-serif text-sm italic ${i === active ? 'text-gold' : 'text-ivory-mute'}`}>{m}</span>
          </div>
        ))}
      </div>
      {level !== null && trend !== 'steady' && <p className="mt-1 text-center text-xs text-gold-soft">{trend === 'crescendo' ? 'cresc. ↗' : 'dim. ↘'}</p>}
    </div>
  )
}

/**
 * Beat indicator: one dot per beat of the bar, the current one lit, and a ring that re-triggers on every detected beat
 * (`seq` changes each beat). `beat` null = idle.
 */
export function BeatPulse({ beats, beat, seq, confident = true }: { beats: number; beat: number | null; seq: number | null; confident?: boolean }) {
  return (
    <div className="relative flex h-24 items-center justify-center gap-3" role="img" aria-label={beat === null ? 'Beat indicator: waiting' : `Beat ${beat} of ${beats}`}>
      {seq !== null && <span key={seq} className="pointer-events-none absolute h-10 w-10 animate-pulseRing rounded-full border border-gold" />}
      {Array.from({ length: beats }, (_, i) => (
        <span key={i} className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs transition-colors duration-150 ${beat === i + 1 ? (confident ? 'border-gold bg-gold text-ink-950' : 'border-gold/60 bg-gold/40 text-ink-950') : 'border-ivory/20 text-ivory-mute'}`}>{i + 1}</span>
      ))}
    </div>
  )
}

/** Live output level of each orchestra section (read from the real audio). */
export function SectionLevels({ levels }: { levels: Record<string, number> }) {
  return (
    <ul className="space-y-2" aria-label="Section activity">
      {SECTIONS.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <span className="w-[72px] shrink-0 text-[11px] text-ivory-mute">{s.label}</span>
          <div className="h-3 min-w-0 flex-1 rounded-sm bg-ink-700">
            <div className="h-full rounded-sm bg-bronze transition-[width] duration-100" style={{ width: `${Math.round((levels[s.id] ?? 0) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
