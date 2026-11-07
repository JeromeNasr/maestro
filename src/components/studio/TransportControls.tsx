import { PhaseTag } from '@/components/ui/StatusTag'

const ACTIONS = ['Start', 'Pause', 'Resume', 'Stop', 'Reset']

/** Phase 1: disabled — the audio engine's playback state machine arrives in Phase 4. */
export function TransportControls() {
  return (
    <section className="panel p-4" aria-labelledby="tr-h">
      <header className="flex items-center justify-between">
        <h2 id="tr-h" className="font-sans text-sm font-medium tracking-wide">Playback</h2>
        <PhaseTag phase={4} />
      </header>
      <div className="mt-4 flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button key={a} className={`btn ${a === 'Start' ? 'btn-gold' : 'btn-ghost'} !px-4`} disabled>{a}</button>
        ))}
      </div>
    </section>
  )
}
