import type { ConductingSession } from '@/conducting/conductingSession'
import { gestureSettings } from '@/config/settings'
import { useStore } from '@/lib/store'
import { SECTIONS } from '@/orchestra/sections'
import { useAudio, useGesture, useMix } from './useConductingSession'

/** Orchestra section controls. Every control changes the real audio graph; the meters read the real output. */
export function MixerPanel({ session }: { session: ConductingSession }) {
  const mix = useMix(session)
  const audio = useAudio(session)
  const gesture = useGesture(session)
  const cfg = useStore(gestureSettings)
  const hand = gesture.mixer
  const used = new Set(audio.loaded?.sections ?? [])
  const anySolo = SECTIONS.some((s) => mix.sections[s.id].solo)
  return (
    <section className="panel p-4" aria-labelledby="mix-h">
      <header className="flex items-center justify-between">
        <h2 id="mix-h" className="font-sans text-sm font-medium tracking-wide">Orchestra</h2>
        {anySolo && <span className="text-xs text-gold-soft">Solo active</span>}
      </header>
      <div className="mt-3 rounded-sm border hairline bg-ink-800/60 px-3 py-2.5" data-testid="finger-mixer">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ivory">Finger mixer <span className="text-ivory-mute">· left hand</span></span>
          <input
            type="checkbox" checked={cfg.mixer.enabled} aria-label="Finger mixer"
            onChange={(e) => gestureSettings.set({ ...cfg, mixer: { ...cfg.mixer, enabled: e.target.checked } })} className="accent-gold"
          />
        </label>
        {cfg.mixer.enabled ? (
          <p className="mt-1.5 text-xs leading-relaxed text-ivory-mute" data-testid="finger-mixer-help">
            Tuck your thumb and show <b className="font-medium text-ivory-dim">1 · 2 · 3 · 4</b> fingers — strings, woodwinds, brass, percussion — and hold still.
            Then move your hand <b className="font-medium text-ivory-dim">up or down</b> to set that section’s volume (all the way down = off).
            Make a <b className="font-medium text-ivory-dim">fist</b> to let go.
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-ivory-mute">Off: the sliders below still work.</p>
        )}
        {cfg.mixer.enabled && (
          <p role="status" className="mt-2 min-h-[1.25rem] text-xs text-gold-soft" data-testid="finger-mixer-status">
            {hand.section
              ? `In your hand: ${SECTIONS.find((s) => s.id === hand.section)!.label} — ${Math.round(hand.volume * 100)}%${hand.volume < 0.03 ? ' (off)' : ''}`
              : hand.candidate
                ? `Hold… ${SECTIONS.find((s) => s.id === hand.candidate)!.label} ${Math.round(hand.progress * 100)}%`
                : hand.fingers !== null && gesture.leftPresent
                  ? `${hand.fingers} finger${hand.fingers === 1 ? '' : 's'} shown${hand.fingers === 0 ? ' (fist)' : hand.fingers > 4 ? '' : ' — hold still'}`
                  : ''}
          </p>
        )}
      </div>
      <ul className="mt-4 space-y-4">
        {SECTIONS.map((s) => {
          const m = mix.sections[s.id]
          const level = audio.levels[s.id] // the real measured output of this section's audio bus (not inferred from the buttons)
          return (
            <li key={s.id} data-testid={`section-${s.id}`} data-held={hand.section === s.id ? 'true' : undefined} className={hand.section === s.id ? '-mx-2 rounded-sm bg-gold/10 px-2 py-1 ring-1 ring-gold/50' : ''}>
              <div className="flex items-center gap-2">
                <span className="w-[84px] shrink-0 text-sm text-ivory-dim"><span className="mr-1.5 inline-block w-3 text-center font-serif text-gold-deep" aria-hidden="true">{SECTIONS.findIndex((x) => x.id === s.id) + 1}</span>{s.label}</span>
                <input
                  type="range" min={0} max={1} step={0.01} value={m.volume} aria-label={`${s.label} volume`}
                  onChange={(e) => session.mixer.setVolume(s.id, Number(e.target.value))} className="min-w-0 flex-1 accent-gold"
                />
                <button className={`btn !px-2.5 !py-1 text-xs ${m.muted ? 'btn-gold' : 'btn-ghost'}`} aria-pressed={m.muted} aria-label={`Mute ${s.label}`} onClick={() => session.mixer.setMuted(s.id, !m.muted)}>Mute</button>
                <button className={`btn !px-2.5 !py-1 text-xs ${m.solo ? 'btn-gold' : 'btn-ghost'}`} aria-pressed={m.solo} aria-label={`Solo ${s.label}`} onClick={() => session.mixer.setSolo(s.id, !m.solo)}>Solo</button>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-[92px]">
                <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-ink-700" role="meter" aria-label={`${s.label} output level`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(level.toFixed(3))}>
                  <div className="bar h-full w-full bg-bronze" style={{ transform: `scaleX(${Math.round(level * 100) / 100})` }} />
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
