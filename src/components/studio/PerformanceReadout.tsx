import type { Composition } from '@/library/types'
import { PhaseTag } from '@/components/ui/StatusTag'

/** Shows "—" for every live value: nothing is measured yet, and we do not invent numbers. */
export function PerformanceReadout({ composition }: { composition?: Composition }) {
  const rows: [string, string][] = [
    ['BPM', '—'],
    ['Beats detected', '—'],
    ['Time signature', composition?.timeSignature ?? '—'],
    ['Position', '—'],
    ['Dynamics', '—'],
    ['Tracking confidence', '—'],
  ]
  return (
    <section className="panel p-4" aria-labelledby="perf-h">
      <header className="flex items-center justify-between">
        <h2 id="perf-h" className="font-sans text-sm font-medium tracking-wide">Performance</h2>
        <PhaseTag phase={5} />
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
