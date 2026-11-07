import type { ConductingSession } from '@/conducting/conductingSession'
import { StatusTag } from '@/components/ui/StatusTag'
import { formatSeconds } from '@/analytics/metrics'
import type { ConductingState } from '@/gesture/types'
import { useAudio, useGesture, useStudio, useVision } from './useConductingSession'

const STATE_TEXT: Record<ConductingState, string> = {
  'no-hand': 'No right hand',
  waiting: 'Waiting for a downbeat',
  conducting: 'Conducting',
  stalled: 'No beats — tempo held',
  'tracking-lost': 'Hand lost — tempo held',
}

/** Live values from the real stores; "—" wherever nothing is being measured. */
export function LiveReadout({ session }: { session: ConductingSession }) {
  const g = useGesture(session)
  const a = useAudio(session)
  const s = useStudio(session)
  const v = useVision(session)
  const hands = v.status === 'running' && (g.rightPresent || g.leftPresent)
  const conf = hands ? Math.round(v.confidence * 100) : null
  const loaded = a.loaded
  const rows: [string, string, string?][] = [
    ['Your tempo', g.bpm === null ? '—' : `${Math.round(g.bpm)}`, 'beats/min conducted'],
    ['Music tempo', a.currentBpm === null || !loaded || a.transport === 'stopped' ? '—' : `${Math.round(a.currentBpm)}`, '♩/min'],
    ['Reference', loaded ? `${Math.round(loaded.referenceBpm)}` : '—', '♩/min as written'],
    ['Meter', s.timeSignature, 'conducting pattern'],
    ['Beats detected', g.stats.beatsAccepted ? String(g.stats.beatsAccepted) : v.status === 'running' ? '0' : '—'],
    ['Position', loaded && a.transport !== 'stopped' ? `${a.bar}.${a.beatInBar}` : '—', loaded ? `${formatSeconds(a.elapsedSec)}` : undefined],
    ['Dynamics', hands || g.dynamics.source !== 'default' ? g.dynamics.mark : '—', g.dynamics.source === 'hold' ? 'held (left hand lost)' : g.dynamics.trend !== 'steady' ? g.dynamics.trend : undefined],
    ['Tracking', conf === null ? '—' : `${conf}%`, 'detector confidence'],
  ]
  return (
    <section className="panel p-4" aria-labelledby="perf-h">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="perf-h" className="font-sans text-sm font-medium tracking-wide">Performance</h2>
        <div className="flex items-center gap-2">
          <span data-testid="conducting-state" className="text-xs text-gold-soft">{STATE_TEXT[g.state]}</span>
          {v.source === 'demo' && <StatusTag kind="demo">Synthetic hands</StatusTag>}
        </div>
      </header>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {rows.map(([k, val, unit]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-widest text-ivory-mute">{k}</dt>
            <dd className="mt-1 font-serif text-3xl text-ivory" data-testid={`readout-${k.toLowerCase().replace(/\s+/g, '-')}`}>{val}</dd>
            {unit && <p className="text-[10px] text-ivory-mute">{unit}</p>}
          </div>
        ))}
      </dl>
    </section>
  )
}
