import type { Composition } from '@/library/types'
import { formatDuration } from '@/library/compositions'
import { CompositionArt } from './CompositionArt'
import { StatusTag } from './StatusTag'

interface Props {
  composition: Composition
  selected?: boolean
  onSelect?: (id: string) => void
  /** Position in the programme, shown as a numeral. */
  number?: number
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

/** One entry of the programme, laid out like a line in a printed concert programme rather than a product card. */
export function CompositionCard({ composition: c, selected = false, onSelect, number }: Props) {
  const available = c.status === 'available'
  return (
    <article
      className={`group grid gap-x-8 gap-y-4 border-t py-8 transition-colors sm:grid-cols-[6rem_1fr] lg:grid-cols-[6rem_11rem_1fr_auto] ${selected ? 'border-gold/70' : 'border-ivory/10'}`}
      aria-label={c.title}
    >
      <p className="hidden font-serif text-5xl italic leading-none text-gold-deep sm:block" aria-hidden="true">{number ? ROMAN[number - 1] : ''}</p>
      <div className={`hidden aspect-[16/9] overflow-hidden border hairline lg:block ${available ? '' : 'opacity-50 grayscale'}`}>
        <CompositionArt art={c.art} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="smallcaps text-sm text-gold-soft">{c.composer}</p>
          {available ? <StatusTag kind="demo">Original · CC0</StatusTag> : <StatusTag kind="neutral">Coming later</StatusTag>}
        </div>
        <h3 className="mt-1 text-3xl leading-tight">{c.title}</h3>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ivory-dim">{c.description}</p>
        {!available && c.pendingReason && <p className="mt-3 max-w-xl text-xs text-ivory-mute">{c.pendingReason}</p>}
        <p className="mt-4 text-xs text-ivory-mute">
          {c.period} · {c.timeSignature} · {c.difficulty} · {formatDuration(c.durationSec)}
        </p>
      </div>
      {onSelect && (
        <div className="sm:col-start-2 lg:col-start-4 lg:self-center">
          <button
            className={`btn whitespace-nowrap ${available && !selected ? 'btn-gold' : 'btn-ghost'}`}
            disabled={!available}
            aria-pressed={selected}
            onClick={() => onSelect(c.id)}
          >
            {!available ? 'Not yet available' : selected ? 'Selected' : 'Select for studio'}
          </button>
        </div>
      )}
    </article>
  )
}
