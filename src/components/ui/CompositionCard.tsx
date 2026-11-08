import type { Composition } from '@/library/types'
import { formatDuration } from '@/library/compositions'
import { CompositionArt } from './CompositionArt'
import { StatusTag } from './StatusTag'

/** Short, honest badge for the licence of the MIDI arrangement. */
export function licenseBadge(lic: string): string {
  if (/^CC0/i.test(lic)) return 'Original · CC0'
  if (/ShareAlike/i.test(lic)) return 'CC BY-SA 3.0'
  if (/Attribution/i.test(lic)) return 'CC BY 3.0'
  if (/Public Domain/i.test(lic)) return 'Public domain'
  return lic
}

interface Props {
  composition: Composition
  selected?: boolean
  onSelect?: (id: string) => void
}

export function CompositionCard({ composition: c, selected = false, onSelect }: Props) {
  const available = c.status === 'available'
  return (
    <article
      className={`panel flex flex-col overflow-hidden transition-colors ${selected ? 'border-gold/70' : 'hover:border-ivory/25'}`}
      aria-label={c.title}
    >
      <div className={`aspect-[16/9] border-b hairline ${available ? '' : 'opacity-60'}`}>
        <CompositionArt art={c.art} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag kind={available ? 'measured' : 'neutral'}>{available ? 'Available' : 'Coming later'}</StatusTag>
          {available && c.midiLicense && <StatusTag kind="neutral">{licenseBadge(c.midiLicense.license)}</StatusTag>}
        </div>
        <h3 className="mt-3 text-2xl leading-snug">{c.title}</h3>
        <p className="text-sm text-gold-soft">{c.composer}</p>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-ivory-dim">{c.description}</p>
        {!available && c.pendingReason && <p className="mt-3 text-xs text-ivory-mute">{c.pendingReason}</p>}
        {available && c.midiLicense && (
          <details className="mt-3 text-xs text-ivory-mute">
            <summary className="cursor-pointer text-ivory-dim hover:text-ivory">Source &amp; licence</summary>
            <div className="mt-2 space-y-1 leading-relaxed">
              <p>{c.midiLicense.license}</p>
              <p>{c.midiLicense.source}</p>
              {c.midiLicense.attribution && <p>{c.midiLicense.attribution}</p>}
              {c.midiLicense.notes && <p>{c.midiLicense.notes}</p>}
              {c.midiLicense.licenseUrl && (
                <p><a className="underline decoration-gold/50 underline-offset-2 hover:text-ivory" href={c.midiLicense.licenseUrl} target="_blank" rel="noreferrer noopener">Licence text</a></p>
              )}
            </div>
          </details>
        )}
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
            className={`btn mt-5 ${available && !selected ? 'btn-gold' : 'btn-ghost'}`}
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
