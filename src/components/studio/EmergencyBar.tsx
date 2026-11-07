import { useEffect } from 'react'
import type { ConductingSession } from '@/conducting/conductingSession'
import { useAudio } from './useConductingSession'

/**
 * Always-visible pause/resume and stop while a piece is playing or paused (fixed to the bottom of the screen, so it is
 * reachable while standing back from the laptop). Also binds Space (pause/resume) and Esc (stop) — except when a form
 * control has focus, where Space keeps its normal meaning.
 */
export function EmergencyBar({ session }: { session: ConductingSession }) {
  const { transport } = useAudio(session)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName) || el.isContentEditable)
      if (e.key === 'Escape') {
        session.stop()
      } else if ((e.key === ' ' || e.code === 'Space') && !typing) {
        e.preventDefault()
        if (session.transport === 'playing') session.pause()
        else if (session.transport === 'paused') session.resume()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session])

  if (transport !== 'playing' && transport !== 'paused') return null
  return (
    <div role="region" aria-label="Emergency controls" className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/40 bg-ink-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-center gap-3 px-4 py-3">
        {transport === 'playing' ? (
          <button className="btn btn-gold min-w-[9rem] !py-3" onClick={() => session.pause()}>Pause <kbd className="ml-1 text-[10px] opacity-70">Space</kbd></button>
        ) : (
          <button className="btn btn-gold min-w-[9rem] !py-3" onClick={() => session.resume()}>Resume <kbd className="ml-1 text-[10px] opacity-70">Space</kbd></button>
        )}
        <button className="btn btn-ghost min-w-[9rem] !py-3" onClick={() => session.stop()}>Stop <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd></button>
      </div>
    </div>
  )
}
