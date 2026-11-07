import { Link } from 'react-router'
import { formatSeconds, pct, sourceLabel } from '@/analytics/metrics'
import type { SessionRecord } from '@/analytics/types'
import { MetricCard } from '@/components/ui/MetricCard'

/** The just-finished performance, exactly as it was recorded — with provenance on every figure. */
export function SessionSummary({ record, onDismiss }: { record: SessionRecord; onDismiss: () => void }) {
  const t = record.tracking
  const hasHands = record.source !== 'none'
  return (
    <section className="panel border-gold/40 p-5" aria-labelledby="sum-h" data-testid="session-summary">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Performance recorded</p>
          <h2 id="sum-h" className="mt-1 text-2xl">{record.compositionTitle}</h2>
          <p className="text-sm text-ivory-dim">{record.completed ? 'Played to the end' : 'Stopped early'} · {sourceLabel(record.source)}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/analytics" className="btn btn-gold !py-2">View analytics</Link>
          <button className="btn btn-ghost !py-2" onClick={onDismiss}>Dismiss</button>
        </div>
      </header>
      {!hasHands && <p className="mt-3 text-sm text-ivory-dim">No hands were tracked while the music played, so tempo, dynamics and tracking figures are unavailable rather than assumed.</p>}
      <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Played" value={formatSeconds(record.playingSec)} kind="measured" />
        <MetricCard label="Beats detected" value={hasHands ? record.beats.accepted : null} kind="measured" />
        <MetricCard label="Average tempo" value={record.tempo.averageBpm === null ? null : `${Math.round(record.tempo.averageBpm)} BPM`} kind="estimate" />
        <MetricCard label="Tempo consistency" value={record.tempo.consistency === null ? null : `${pct(record.tempo.consistency)}%`} kind="estimate" />
        <MetricCard label="Right hand tracked" value={t.right === null ? null : `${pct(t.right)}%`} kind="measured" />
        <MetricCard label="Left hand tracked" value={t.left === null ? null : `${pct(t.left)}%`} kind="measured" />
        <MetricCard label="Pattern adherence" value={record.patternAdherence === null ? null : `${pct(record.patternAdherence)}%`} kind="estimate" />
        <MetricCard label="Dynamic range" value={record.dynamics ? `${Math.round(record.dynamics.minLevel * 100)}–${Math.round(record.dynamics.maxLevel * 100)}%` : null} kind="measured" />
      </dl>
    </section>
  )
}
