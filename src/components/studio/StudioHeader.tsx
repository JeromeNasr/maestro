import { Link } from 'react-router'
import type { ConductingSession } from '@/conducting/conductingSession'
import { COMPOSITIONS, formatDuration } from '@/library/compositions'
import { selectComposition } from '@/library/selection'
import { useAudio, useStudio } from './useConductingSession'

export function StudioHeader({ session }: { session: ConductingSession }) {
  const s = useStudio(session)
  const a = useAudio(session)
  const c = s.composition
  const locked = a.transport === 'playing' || a.transport === 'paused'
  const available = COMPOSITIONS.filter((x) => x.status === 'available')
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">Conducting studio</p>
        <h1 className="mt-1 text-3xl sm:text-4xl">{c?.title ?? 'No composition selected'}</h1>
        {c && <p className="text-sm text-ivory-dim">{c.composer} · written in {c.timeSignature} · {c.difficulty} · ~{formatDuration(c.durationSec)}</p>}
      </div>
      <div className="flex flex-wrap items-end gap-3 text-xs text-ivory-mute">
        <label className="flex flex-col gap-1">
          Composition
          <select
            value={c?.id ?? ''} disabled={locked} title={locked ? 'Stop the piece to change composition' : undefined}
            onChange={(e) => {
              selectComposition(e.target.value)
              void session.selectComposition(e.target.value)
            }}
            className="rounded-sm border border-ivory/15 bg-ink-900 px-2 py-2 text-sm text-ivory disabled:opacity-50"
          >
            {available.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Conduct in
          <select
            value={s.timeSignature} disabled={locked || !c || c.conductingOptions.length < 2}
            title={locked ? 'Stop or finish the piece to change the pattern' : c && c.conductingOptions.length < 2 ? 'This piece supports one conducting pattern' : undefined}
            onChange={(e) => session.setTimeSignature(e.target.value as typeof s.timeSignature)}
            className="rounded-sm border border-ivory/15 bg-ink-900 px-2 py-2 text-sm text-ivory disabled:opacity-50"
          >
            {(c?.conductingOptions ?? [s.timeSignature]).map((ts) => (
              <option key={ts} value={ts}>{ts}{c && ts !== c.timeSignature ? ' (in two)' : ''}</option>
            ))}
          </select>
        </label>
        <Link to="/library" className="btn btn-ghost !py-2">Library</Link>
      </div>
    </div>
  )
}
