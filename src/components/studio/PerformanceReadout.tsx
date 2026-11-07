import type { Composition } from '@/library/types'
import { StatusTag } from '@/components/ui/StatusTag'

/** Shows "—" for every value that has no real source yet. Only tracking confidence is live (Phase 2). */
export function PerformanceReadout({ composition, trackingConfidence = null }: { composition?: Composition; trackingConfidence?: number | null }) {
  const rows: [string, string][] = [
    ['BPM', '—'],
    ['Beats detected', '—'],
    ['Time signature', composition?.timeSignature ?? '—'],
    ['Position', '—'],
    ['Dynamics', '—'],
    ['Tracking confidence', trackingConfidence === null ? '—' : `${Math.round(trackingConfidence * 100)}%`],
  ]
  return (
    <section className="panel p-4" aria-labelledby="perf-h">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="perf-h" className="font-sans text-sm font-medium tracking-wide">Performance</h2>
        <StatusTag kind="phase">Live: tracking confidence · rest Phase 5</StatusTag>
      </header>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-widest text-ivory-mute">{k}</dt>
            <dd className="mt-1 font-serif text-3xl text-ivory">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
