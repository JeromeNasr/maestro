import { PhaseTag } from '@/components/ui/StatusTag'

export const SECTIONS = [
  { id: 'strings', label: 'Strings' },
  { id: 'woodwinds', label: 'Woodwinds' },
  { id: 'brass', label: 'Brass' },
  { id: 'percussion', label: 'Percussion' },
] as const

/** Phase 1: controls are disabled — they are not connected to any audio yet (Phase 4). */
export function SectionMixer() {
  return (
    <section className="panel p-4" aria-labelledby="mix-h">
      <header className="flex items-center justify-between">
        <h2 id="mix-h" className="font-sans text-sm font-medium tracking-wide">Orchestra</h2>
        <PhaseTag phase={4} />
      </header>
      <ul className="mt-4 space-y-4">
        {SECTIONS.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <span className="w-24 text-sm text-ivory-dim">{s.label}</span>
            <input type="range" min={0} max={100} defaultValue={80} disabled aria-label={`${s.label} volume`} className="flex-1 accent-gold" />
            <button className="btn btn-ghost !px-2.5 !py-1 text-xs" disabled aria-label={`Mute ${s.label}`}>Mute</button>
          </li>
        ))}
        <li className="flex items-center gap-3 border-t hairline pt-4">
          <span className="w-24 text-sm text-ivory">Master</span>
          <input type="range" min={0} max={100} defaultValue={80} disabled aria-label="Master volume" className="flex-1 accent-gold" />
          <span className="w-[52px]" />
        </li>
      </ul>
    </section>
  )
}
