import type { ConductingSession } from '@/conducting/conductingSession'
import { SECTIONS } from '@/orchestra/sections'
import { useAudio, useMix } from './useConductingSession'

/** Orchestra section controls. Every control changes the real audio graph; the meters read the real output. */
export function MixerPanel({ session }: { session: ConductingSession }) {
  const mix = useMix(session)
  const audio = useAudio(session)
  const used = new Set(audio.loaded?.sections ?? [])
  const anySolo = SECTIONS.some((s) => mix.sections[s.id].solo)
  return (
    <section className="panel p-4" aria-labelledby="mix-h">
      <header className="flex items-center justify-between">
        <h2 id="mix-h" className="font-sans text-sm font-medium tracking-wide">Orchestra</h2>
        {anySolo && <span className="text-xs text-gold-soft">Solo active</span>}
      </header>
      <ul className="mt-4 space-y-4">
        {SECTIONS.map((s) => {
          const m = mix.sections[s.id]
          const level = audio.levels[s.id] // the real measured output of this section's audio bus (not inferred from the buttons)
          return (
            <li key={s.id} data-testid={`section-${s.id}`}>
              <div className="flex items-center gap-2">
                <span className="w-[84px] shrink-0 text-sm text-ivory-dim">{s.label}</span>
                <input
                  type="range" min={0} max={1} step={0.01} value={m.volume} aria-label={`${s.label} volume`}
                  onChange={(e) => session.mixer.setVolume(s.id, Number(e.target.value))} className="min-w-0 flex-1 accent-gold"
                />
                <button className={`btn !px-2.5 !py-1 text-xs ${m.muted ? 'btn-gold' : 'btn-ghost'}`} aria-pressed={m.muted} aria-label={`Mute ${s.label}`} onClick={() => session.mixer.setMuted(s.id, !m.muted)}>Mute</button>
                <button className={`btn !px-2.5 !py-1 text-xs ${m.solo ? 'btn-gold' : 'btn-ghost'}`} aria-pressed={m.solo} aria-label={`Solo ${s.label}`} onClick={() => session.mixer.setSolo(s.id, !m.solo)}>Solo</button>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-[92px]">
                <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-ink-700" role="meter" aria-label={`${s.label} output level`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(level.toFixed(3))}>
                  <div className="h-full bg-bronze transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
                </div>
                {audio.loaded && !used.has(s.id) && <span className="text-[10px] text-ivory-mute">not in this piece</span>}
              </div>
            </li>
          )
        })}
        <li className="flex items-center gap-2 border-t hairline pt-4">
          <span className="w-[84px] shrink-0 text-sm text-ivory">Master</span>
          <input type="range" min={0} max={1} step={0.01} value={mix.master} aria-label="Master volume" onChange={(e) => session.mixer.setMaster(Number(e.target.value))} className="min-w-0 flex-1 accent-gold" />
        </li>
      </ul>
    </section>
  )
}
