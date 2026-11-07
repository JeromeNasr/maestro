import type { ConductingSession } from '@/conducting/conductingSession'
import { SECTIONS } from '@/orchestra/sections'
import { useAudio, useStudio } from './useConductingSession'

/** Tempo behaviour and what the piece is made of (the track → section mapping used for the mixer). */
export function ConductingPanel({ session }: { session: ConductingSession }) {
  const s = useStudio(session)
  const a = useAudio(session)
  const ref = a.loaded?.referenceBpm
  return (
    <section className="panel p-4" aria-labelledby="cond-h">
      <h2 id="cond-h" className="font-sans text-sm font-medium tracking-wide">Tempo &amp; score</h2>
      <fieldset className="mt-4">
        <legend className="text-[11px] uppercase tracking-widest text-ivory-mute">Tempo</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ivory-dim">
          <label className="flex items-center gap-2">
            <input type="radio" name="tempo-mode" checked={s.tempoMode === 'follow'} onChange={() => session.setTempoMode('follow')} className="accent-gold" />
            Follow my right hand
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="tempo-mode" checked={s.tempoMode === 'fixed'} onChange={() => session.setTempoMode('fixed')} className="accent-gold" />
            Fixed tempo
          </label>
        </div>
        {s.tempoMode === 'fixed' && (
          <label className="mt-3 flex items-center gap-3 text-sm text-ivory-dim">
            <span className="shrink-0">Speed</span>
            <input type="range" min={50} max={150} value={s.fixedTempoPct} onChange={(e) => session.setFixedTempoPct(Number(e.target.value))} aria-label="Fixed tempo as a percentage of the written tempo" className="min-w-0 flex-1 accent-gold" />
            <span className="w-24 text-right tabular-nums text-ivory">{s.fixedTempoPct}%{ref ? ` · ${Math.round((ref * s.fixedTempoPct) / 100)}` : ''}</span>
          </label>
        )}
        <p className="mt-2 text-xs leading-relaxed text-ivory-mute">
          {s.tempoMode === 'follow'
            ? 'The music glides toward the tempo of your beats. If you stop conducting, it keeps the last tempo.'
            : 'Hand tempo is ignored; the piece plays at a fixed speed. Dynamics and cues still follow your hands.'}
        </p>
      </fieldset>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ivory-dim hover:text-gold-soft">Instruments in this piece</summary>
        {s.tracks.length === 0 ? (
          <p className="mt-2 text-xs text-ivory-mute">No score loaded.</p>
        ) : (
          <table className="mt-3 w-full text-left text-xs">
            <caption className="sr-only">MIDI tracks and the orchestra section each is assigned to</caption>
            <thead className="text-[10px] uppercase tracking-widest text-ivory-mute"><tr><th className="pb-1 pr-2">Instrument</th><th className="pb-1 pr-2">Section</th><th className="pb-1">Notes</th></tr></thead>
            <tbody>
              {s.tracks.map((t) => (
                <tr key={t.id} className="border-t hairline">
                  <td className="py-1 pr-2">{t.name}</td>
                  <td className="py-1 pr-2 text-ivory-dim">{SECTIONS.find((x) => x.id === t.section)?.label}</td>
                  <td className="py-1 tabular-nums text-ivory-mute">{t.noteCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  )
}
