import type { Composition } from '@/library/types'
import { formatDuration } from '@/library/compositions'
import { CompositionArt } from './CompositionArt'
import { StatusTag } from './StatusTag'

interface Props {
  composition: Composition
  selected?: boolean
  onSelect?: (id: string) => void
}

export function CompositionCard({ composition: c, selected = false, onSelect }: Props) {
  const available = c.status === 'available'
  return (
    <article
      className={`panel flex flex-col overflow-hidden transition-colors ${selected ? 'border-gold/70' : 'hover:border-ivory/25'} ${available ? '' : 'opacity-75'}`}
      aria-label={c.title}
    >
      <div className="aspect-[16/9] border-b hairline">
        <CompositionArt art={c.art} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag kind={available ? 'measured' : 'phase'}>{available ? 'Available' : 'Coming later'}</StatusTag>
          {c.id === 'maestro-demo-001' && <StatusTag kind="demo">Original demo</StatusTag>}
        </div>
        <h3 className="mt-3 text-2xl leading-snug">{c.title}</h3>
        <p className="text-sm text-gold-soft">{c.composer}</p>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-ivory-dim">{c.description}</p>
        {!available && c.pendingReason && <p className="mt-3 text-xs text-ivory-mute">{c.pendingReason}</p>}
        <dl className="mt-4 grid grid-cols-4 gap-2 border-t hairline pt-4 text-xs">
          {[
            ['Period', c.period],
            ['Meter', c.timeSignature],
            ['Level', c.difficulty],
            ['Length', formatDuration(c.durationSec)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-ivory-mute">{k}</dt>
              <dd className="mt-0.5 text-ivory">{v}</dd>
            </div>
          ))}
        </dl>
        {onSelect && (
          <button
            className={`btn mt-5 ${selected ? 'btn-ghost' : 'btn-gold'}`}
            disabled={!available}
            aria-pressed={selected}
            onClick={() => onSelect(c.id)}
          >
            {!available ? 'Not yet available' : selected ? 'Selected' : 'Select for studio'}
          </button>
        )}
      </div>
    </article>
  )
}
