import type { ConductingSession } from '@/conducting/conductingSession'
import { formatSeconds } from '@/analytics/metrics'
import { useAudio, useStudio } from './useConductingSession'

const STATUS_TEXT = {
  uninitialized: 'Audio is off — it starts when you press Enable audio or Start (browsers require a click).',
  initializing: 'Starting audio…',
  ready: '',
  error: '',
} as const

export function TransportPanel({ session }: { session: ConductingSession }) {
  const audio = useAudio(session)
  const studio = useStudio(session)
  const { transport, status } = audio
  const loaded = audio.loaded
  const canStart = studio.load === 'ready' && (transport === 'stopped' || transport === 'finished') && status !== 'initializing'
  const sr = audio.backend?.sampleRate ? `${(audio.backend.sampleRate / 1000).toFixed(1)} kHz` : null
  const lat = audio.backend?.baseLatencySec !== undefined ? `${Math.round(audio.backend.baseLatencySec * 1000)} ms latency` : null
  const total = loaded?.nominalSec ?? 0

  return (
    <section className="panel p-4" aria-labelledby="tr-h">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tr-h" className="font-sans text-sm font-medium tracking-wide">Playback</h2>
        <span data-testid="audio-status" className={`text-xs ${status === 'error' ? 'text-gold-soft' : 'text-ivory-mute'}`}>
          {status === 'ready' ? `Audio running${sr ? ` · ${sr}` : ''}${lat ? ` · ${lat}` : ''}` : status === 'error' ? 'Audio problem' : STATUS_TEXT[status]}
        </span>
      </header>

      {status === 'error' && audio.error && <p role="alert" className="mt-3 text-sm text-gold-soft">{audio.error}</p>}
      {audio.lateNotes > 0 && <p role="status" className="mt-3 text-xs text-gold-soft" data-testid="late-notes">{audio.lateNotes} note{audio.lateNotes === 1 ? ' was' : 's were'} skipped because the browser was too busy to play {audio.lateNotes === 1 ? 'it' : 'them'} on time. Close other tabs or lower the camera load if this keeps growing.</p>}
      {studio.load === 'loading' && <p role="status" className="mt-3 text-sm text-ivory-dim">Loading the score…</p>}
      {studio.load === 'error' && <p role="alert" className="mt-3 text-sm text-gold-soft">{studio.loadError}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {status !== 'ready' && (
          <button className="btn btn-ghost !px-4" disabled={status === 'initializing'} onClick={() => void session.enableAudio()}>Enable audio</button>
        )}
        <button className="btn btn-gold !px-4" disabled={!canStart} onClick={() => void session.start()}>{transport === 'finished' ? 'Play again' : 'Start'}</button>
        <button className="btn btn-ghost !px-4" disabled={transport !== 'playing'} onClick={() => session.pause()}>Pause</button>
        <button className="btn btn-ghost !px-4" disabled={transport !== 'paused'} onClick={() => session.resume()}>Resume</button>
        <button className="btn btn-ghost !px-4" disabled={transport !== 'playing' && transport !== 'paused'} onClick={() => session.stop()}>Stop</button>
        <button className="btn btn-ghost !px-4" disabled={transport === 'stopped' && audio.targetBpm === loaded?.referenceBpm && studio.tempoMode === 'follow'} onClick={() => session.reset()} title="Stop, and return tempo, mix and conducting state to their defaults">Reset</button>
      </div>

      <div className="mt-4" aria-label="Playback position">
        <div className="h-1.5 overflow-hidden rounded-sm bg-ink-600" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(audio.progress * 100)} aria-label="Progress through the piece">
          <div className="h-full bg-gold transition-[width] duration-150" style={{ width: `${audio.progress * 100}%` }} />
        </div>
        <p className="mt-2 flex justify-between gap-3 text-xs tabular-nums text-ivory-mute" data-testid="position" data-bar={audio.bar} data-beat={audio.beatInBar}>
          <span>{loaded ? `Bar ${audio.bar} · beat ${audio.beatInBar}` : '—'}</span>
          <span>{loaded ? `${formatSeconds(audio.elapsedSec)} / ~${formatSeconds(total)}` : '—'}</span>
        </p>
      </div>
    </section>
  )
}
