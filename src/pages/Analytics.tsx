import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { allExercises, academyProgress } from '@/academy/progress'
import { LESSONS } from '@/academy/lessons'
import { clearHistory, deleteRecord, exportHistoryJson, historyStore } from '@/analytics/historyStore'
import { formatSeconds, pct, sourceLabel, summarise } from '@/analytics/metrics'
import type { SessionRecord } from '@/analytics/types'
import { MetricCard } from '@/components/ui/MetricCard'
import { StatusTag } from '@/components/ui/StatusTag'
import { DYNAMIC_MARKS } from '@/gesture/dynamicsMapper'
import { useStore } from '@/lib/store'

function TempoChart({ record }: { record: SessionRecord }) {
  const s = record.tempo.series
  if (s.length < 2) return <p className="text-sm text-ivory-mute">Not enough tempo data was recorded for a chart.</p>
  const W = 320
  const H = 110
  const maxT = Math.max(...s.map((p) => p[0]), 1)
  const bpms = s.map((p) => p[1])
  const lo = Math.min(...bpms, record.referenceBpm) - 5
  const hi = Math.max(...bpms, record.referenceBpm) + 5
  const x = (t: number) => 8 + (t / maxT) * (W - 16)
  const y = (b: number) => H - 8 - ((b - lo) / (hi - lo)) * (H - 16)
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full max-w-md" role="img" aria-label="Conducted tempo over the performance">
        <line x1="8" x2={W - 8} y1={y(record.referenceBpm)} y2={y(record.referenceBpm)} stroke="#8c6a43" strokeDasharray="3 3" />
        <polyline fill="none" stroke="#c4a35a" strokeWidth="2" points={s.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')} />
      </svg>
      <figcaption className="text-xs text-ivory-mute">Your conducted tempo (gold) · written tempo (dashed) · {Math.round(lo + 5)}–{Math.round(hi - 5)} BPM</figcaption>
    </figure>
  )
}

function DynamicsBars({ record }: { record: SessionRecord }) {
  const d = record.dynamics
  if (!d) return <p className="text-sm text-ivory-mute">The left hand was not tracked while the music played, so dynamics usage is unavailable.</p>
  const max = Math.max(...Object.values(d.secondsByMark), 0.001)
  return (
    <figure>
      <div className="flex h-24 items-end gap-2" role="img" aria-label="Seconds spent at each dynamic marking">
        {DYNAMIC_MARKS.map((m) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-sm bg-bronze" style={{ height: `${Math.max(2, (d.secondsByMark[m] / max) * 72)}px` }} title={`${d.secondsByMark[m].toFixed(1)} s`} />
            <span className="font-serif text-sm italic text-ivory-dim">{m}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1 text-xs text-ivory-mute">
        Time at each marking while the left hand was tracked.{d.secondsHeld > 1 ? ` ${formatSeconds(d.secondsHeld)} had no left hand (level held) and is not counted.` : ''}
      </figcaption>
    </figure>
  )
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Analytics() {
  const records = useStore(historyStore)
  const progress = useStore(academyProgress)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const ordered = useMemo(() => [...records].reverse(), [records])
  const selected = ordered.find((r) => r.id === selectedId) ?? ordered[0] ?? null
  const total = summarise(records)
  const exercises = allExercises(progress)
  const passed = exercises.filter((e) => e.result.passed).length

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Performance analytics</p>
      <h1 className="mt-3 text-5xl">Your performances</h1>
      <p className="mt-4 max-w-2xl text-ivory-dim">
        Recorded from your own sessions and stored only in this browser. Every figure says where it comes from:{' '}
        <StatusTag kind="measured" /> counted or timed directly, <StatusTag kind="estimate" /> derived from the gesture recogniser’s own analysis (not ground truth), or <StatusTag kind="unavailable" /> there was no data — never filled in with a guess.
      </p>

      {records.length === 0 ? (
        <div className="panel mt-10 px-6 py-16 text-center">
          <h2 className="text-3xl">No performances recorded yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-ivory-dim">Conduct (or just play) a piece in the Studio for at least five seconds and it will appear here with real numbers.</p>
          <Link to="/studio" className="btn btn-gold mt-6">Open the studio</Link>
        </div>
      ) : (
        <div className="mt-10 space-y-14">
          {total && (
            <div>
              <h2 className="mb-5 text-2xl">Practice history</h2>
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Sessions" value={total.sessions} kind="measured" note={`${total.withHands} with your camera · ${total.completed} played to the end`} />
                <MetricCard label="Total playing time" value={formatSeconds(total.totalPlayingSec)} kind="measured" />
                <MetricCard label="Average tempo consistency" value={total.consistency === null ? null : `${pct(total.consistency)}%`} kind="estimate" note="Camera sessions only." />
                <MetricCard label="Average hand tracking" value={total.trackingRight === null ? null : `R ${pct(total.trackingRight)}% · L ${pct(total.trackingLeft)}%`} kind="measured" note="Share of frames each hand was seen." />
                <MetricCard label="Exercises passed" value={exercises.length ? `${passed} of ${exercises.length} attempted` : null} kind="measured" note="From the Academy." />
              </dl>
            </div>
          )}

          {selected && (
            <div data-testid="selected-session">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl">{selected.compositionTitle}</h2>
                  <p className="text-sm text-ivory-dim">
                    {new Date(selected.startedAt).toLocaleString()} · conducted in {selected.timeSignature} · {selected.completed ? 'played to the end' : 'stopped early'} · {sourceLabel(selected.source)}
                  </p>
                </div>
                {selected.source === 'demo' && <StatusTag kind="demo">Synthetic conductor</StatusTag>}
              </div>
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Duration played" value={formatSeconds(selected.playingSec)} kind="measured" note="Audio clock; pauses excluded." />
                <MetricCard label="Beats detected" value={selected.source === 'none' ? null : selected.beats.accepted} kind="measured" note={selected.source === 'none' ? undefined : `${selected.beats.usedForTempo} used for tempo`} />
                <MetricCard label="Average tempo" value={selected.tempo.averageBpm === null ? null : `${Math.round(selected.tempo.averageBpm)} BPM`} kind="estimate" note={selected.tempo.minBpm === null ? undefined : `${Math.round(selected.tempo.minBpm)}–${Math.round(selected.tempo.maxBpm!)} · written ${Math.round(selected.referenceBpm)}`} />
                <MetricCard label="Tempo consistency" value={selected.tempo.consistency === null ? null : `${pct(selected.tempo.consistency)}%`} kind="estimate" note="How even consecutive beats were. Intentional tempo changes are not penalised." />
                <MetricCard label="Pattern adherence" value={selected.patternAdherence === null ? null : `${pct(selected.patternAdherence)}%`} kind="estimate" note="The recogniser’s own view of how well your strokes fit the pattern — there is no reference to compare against." />
                <MetricCard label="Right hand tracked" value={selected.tracking.right === null ? null : `${pct(selected.tracking.right)}%`} kind="measured" />
                <MetricCard label="Left hand tracked" value={selected.tracking.left === null ? null : `${pct(selected.tracking.left)}%`} kind="measured" />
                <MetricCard label="Detector confidence" value={selected.tracking.meanConfidence === null ? null : `${pct(selected.tracking.meanConfidence)}%`} kind="measured" note="Model-reported, not accuracy." />
              </dl>
              <div className="mt-8 grid gap-10 md:grid-cols-2">
                <div><h3 className="mb-3 text-xl">Tempo</h3><TempoChart record={selected} /></div>
                <div><h3 className="mb-3 text-xl">Dynamics usage</h3><DynamicsBars record={selected} /></div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl">Sessions</h2>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost !py-2" onClick={() => download('maestro-sessions.json', exportHistoryJson(records))}>Export JSON</button>
                {confirmClear ? (
                  <>
                    <button className="btn btn-gold !py-2" onClick={() => { clearHistory(); setConfirmClear(false) }}>Confirm: delete all {records.length}</button>
                    <button className="btn btn-ghost !py-2" onClick={() => setConfirmClear(false)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-ghost !py-2" onClick={() => setConfirmClear(true)}>Clear history</button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Recorded performances</caption>
                <thead className="text-[11px] uppercase tracking-widest text-ivory-mute">
                  <tr><th className="pb-2 pr-3">When</th><th className="pb-2 pr-3">Piece</th><th className="pb-2 pr-3">Played</th><th className="pb-2 pr-3">Source</th><th className="pb-2 pr-3">Consistency</th><th className="pb-2" /></tr>
                </thead>
                <tbody>
                  {ordered.map((r) => (
                    <tr key={r.id} className={`border-t hairline ${selected?.id === r.id ? 'bg-ink-900' : ''}`}>
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.startedAt).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{r.compositionTitle}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatSeconds(r.playingSec)}</td>
                      <td className="py-2 pr-3 text-ivory-dim">{r.source === 'camera' ? 'Camera' : r.source === 'demo' ? 'Demo' : 'No hands'}</td>
                      <td className="py-2 pr-3 tabular-nums">{r.tempo.consistency === null ? '—' : `${pct(r.tempo.consistency)}%`}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button className="mr-3 text-xs text-gold-soft hover:text-gold" onClick={() => setSelectedId(r.id)} aria-label={`Show details of ${r.compositionTitle} on ${new Date(r.startedAt).toLocaleDateString()}`}>Details</button>
                        <button className="text-xs text-ivory-mute hover:text-gold-soft" onClick={() => deleteRecord(r.id)} aria-label={`Delete ${r.compositionTitle} session`}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {exercises.length > 0 && (
        <div className="mt-14">
          <h2 className="mb-4 text-2xl">Academy exercises</h2>
          <ul className="divide-y divide-ivory/10 border-y hairline text-sm">
            {exercises.map((e) => (
              <li key={`${e.lessonId}/${e.exerciseId}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{LESSONS.find((l) => l.id === e.lessonId)?.title ?? e.lessonId} · {e.exerciseId}</span>
                <span className="text-ivory-dim">{e.result.passed ? 'Passed' : 'Not yet passed'} · best {Math.round(e.result.bestScore)}% · {e.result.attempts} attempt{e.result.attempts === 1 ? '' : 's'} <StatusTag kind="measured" /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
