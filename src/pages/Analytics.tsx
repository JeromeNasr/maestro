import { useState } from 'react'
import { Link } from 'react-router-dom'
import { historyStore, clearHistory } from '@/analytics/historyStore'
import { SAMPLE_RECORDS } from '@/analytics/sampleData'
import { formatSeconds, summarise } from '@/analytics/metrics'
import { getComposition } from '@/library/compositions'
import { useStore } from '@/lib/store'
import { StatusTag } from '@/components/ui/StatusTag'
import type { PerformanceRecord } from '@/analytics/types'

function Latest({ r }: { r: PerformanceRecord }) {
  const items: [string, string, 'measured' | 'estimate'][] = [
    ['Duration', formatSeconds(r.durationSec), 'measured'],
    ['Beats detected', String(r.beatCount), 'measured'],
    ['Tracking reliability', `${r.trackingReliability}%`, 'measured'],
    ['Average BPM', String(r.averageBpm), 'estimate'],
    ['Tempo consistency', `${r.tempoConsistency}/100`, 'estimate'],
    ['Dynamic range', `${r.dynamicRangeMarks[0]} → ${r.dynamicRangeMarks[1]}`, 'estimate'],
  ]
  return (
    <dl className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v, kind]) => (
        <div key={k} className="border-t hairline pt-3">
          <dt className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-ivory-mute">{k} <StatusTag kind={kind} /></dt>
          <dd className="mt-1 font-serif text-4xl">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function BpmHistory({ records }: { records: PerformanceRecord[] }) {
  const max = Math.max(...records.map((r) => r.averageBpm), 1)
  return (
    <svg viewBox={`0 0 ${records.length * 40 + 10} 90`} className="h-32 w-full max-w-md" role="img" aria-label="Average BPM per performance">
      {records.map((r, i) => {
        const h = (r.averageBpm / max) * 70
        return (
          <g key={r.id}>
            <rect x={10 + i * 40} y={80 - h} width="24" height={h} fill="#8c6a43" />
            <text x={22 + i * 40} y="89" fontSize="7" textAnchor="middle" fill="#8f8878">{i + 1}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function Analytics() {
  const real = useStore(historyStore)
  const [preview, setPreview] = useState(false)
  const records = preview ? SAMPLE_RECORDS : real
  const latest = records[records.length - 1]
  const total = summarise(records)

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Performance analytics</p>
      <h1 className="mt-3 text-5xl">Your performances</h1>
      <p className="mt-4 max-w-2xl text-ivory-dim">
        Results from your own conducting sessions, stored only in this browser. Each figure is tagged as <StatusTag kind="measured" /> (directly counted) or <StatusTag kind="estimate" /> (derived from gesture analysis).
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button className="btn btn-ghost !py-2" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
          {preview ? 'Hide sample layout' : 'Preview layout with sample data'}
        </button>
        {!preview && real.length > 0 && <button className="btn btn-ghost !py-2" onClick={clearHistory}>Clear history</button>}
        <StatusTag kind="phase">Recording: Planned · Phase 6</StatusTag>
      </div>

      {preview && (
        <p role="status" className="mt-6 border-l-2 border-bronze bg-ink-900 px-4 py-3 text-sm text-ivory-dim">
          <StatusTag kind="demo" /> <span className="ml-2">These numbers are invented sample values to show the layout. They were not produced by any performance.</span>
        </p>
      )}

      {records.length === 0 ? (
        <div className="panel mt-10 px-6 py-20 text-center">
          <h2 className="text-3xl">No performances recorded yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-ivory-dim">
            Performance recording is not implemented yet. Once it is, finished sessions will appear here.
          </p>
          <Link to="/studio" className="btn btn-gold mt-6">Open the studio</Link>
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          <div>
            <h2 className="mb-5 text-2xl">Latest performance</h2>
            <Latest r={latest} />
          </div>
          {total && (
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="mb-4 text-2xl">History</h2>
                <BpmHistory records={records} />
                <p className="mt-1 text-xs text-ivory-mute">Average BPM per performance (estimate)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Performance history</caption>
                  <thead className="text-[11px] uppercase tracking-widest text-ivory-mute">
                    <tr><th className="pb-2 pr-3">#</th><th className="pb-2 pr-3">Piece</th><th className="pb-2 pr-3">Length</th><th className="pb-2">Reliability</th></tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={r.id} className="border-t hairline">
                        <td className="py-2 pr-3">{i + 1}</td>
                        <td className="py-2 pr-3">{getComposition(r.compositionId)?.title ?? r.compositionId}</td>
                        <td className="py-2 pr-3 tabular-nums">{formatSeconds(r.durationSec)}</td>
                        <td className="py-2 tabular-nums">{r.trackingReliability}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
