import type { ReactNode } from 'react'
import { StatusTag } from './StatusTag'
import type { Provenance } from '@/analytics/types'

/**
 * One analytics figure with its provenance: Measured (counted/timed), Estimate (derived from gesture analysis), or
 * Unavailable (no data — never shown as a good or bad number).
 */
export function MetricCard({ label, value, kind, note }: { label: string; value: ReactNode | null; kind: Exclude<Provenance, 'unavailable'>; note?: string }) {
  const missing = value === null
  return (
    <div className="border-t hairline pt-3" data-testid={`metric-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
      <dt className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest text-ivory-mute">
        {label} <StatusTag kind={missing ? 'unavailable' : kind} />
      </dt>
      <dd className={`mt-1 font-serif text-4xl ${missing ? 'text-ivory-mute' : ''}`}>{missing ? '—' : value}</dd>
      {note && <p className="mt-1 text-xs leading-relaxed text-ivory-mute">{note}</p>}
    </div>
  )
}
