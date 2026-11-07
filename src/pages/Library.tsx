import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { COMPOSITIONS, getComposition, searchCompositions } from '@/library/compositions'
import { selectComposition, selectedCompositionId } from '@/library/selection'
import { useStore } from '@/lib/store'
import { CompositionCard } from '@/components/ui/CompositionCard'

export function Library() {
  const [query, setQuery] = useState('')
  const selectedId = useStore(selectedCompositionId)
  const results = useMemo(() => searchCompositions(query), [query])
  const selected = getComposition(selectedId)

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Composition library</p>
      <h1 className="mt-3 text-5xl">Choose your repertoire</h1>
      <p className="mt-4 max-w-2xl text-ivory-dim">
        Pieces become selectable only once their MIDI arrangement has a verified licence. Others are listed so you can see what is planned.
      </p>

      <div className="mt-10 flex flex-col gap-4 border-y hairline py-5 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex-1 sm:max-w-md">
          <span className="sr-only">Search compositions</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, composer, period, meter…"
            className="w-full rounded-sm border border-ivory/15 bg-ink-900 px-4 py-2.5 text-sm text-ivory placeholder:text-ivory-mute"
          />
        </label>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-ivory-dim" data-testid="selection-summary">
            Selected: <span className="text-gold-soft">{selected?.title ?? 'none'}</span>
          </span>
          <Link to="/studio" className="btn btn-gold !py-2">Open studio</Link>
        </div>
      </div>

      <p className="mt-4 text-xs text-ivory-mute" aria-live="polite">
        {results.length} of {COMPOSITIONS.length} compositions
      </p>

      {results.length === 0 ? (
        <p className="py-20 text-center text-ivory-dim">No compositions match “{query}”.</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {results.map((c) => (
            <CompositionCard key={c.id} composition={c} selected={c.id === selectedId} onSelect={selectComposition} />
          ))}
        </div>
      )}
    </section>
  )
}
