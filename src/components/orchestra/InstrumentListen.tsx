import { useEffect, useRef, useState } from 'react'
import { playableRange, rangeNotes, type InstrumentPreview } from '@/audio/instrumentPreview'
import { noteName } from '@/lib/notes'
import type { InstrumentLore } from '@/orchestra/lore'

type Mode = 'idle' | 'loading' | 'one' | 'range' | 'error'

/** "Hear it" and "Play the whole range" for one instrument, played from the recordings used in the Studio. */
export function InstrumentListen({ i, preview }: { i: InstrumentLore; preview: InstrumentPreview }) {
  const [mode, setMode] = useState<Mode>('idle')
  const [now, setNow] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [limit, setLimit] = useState<[number, number] | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const run = async (kind: 'one' | 'range') => {
    if (mode === 'one' || mode === 'range') {
      preview.stop()
      setMode('idle')
      setNow(null)
      return
    }
    setMode('loading')
    setErr('')
    try {
      await preview.load(i.sound)
      if (!alive.current) return
      let notes: { midi: number; velocity?: number }[]
      let opts: { noteSeconds?: number; gap?: number } = {}
      if (!i.range) {
        notes = [{ midi: 60, velocity: 0.25 }, { midi: 60, velocity: 0.95 }] // the same hit, soft and then loud
        opts = { gap: 1.4 }
      } else {
        const roots = await preview.roots(i.sound)
        const [lo, hi] = playableRange(i.range, roots)
        setLimit(lo > i.range[0] || hi < i.range[1] ? [lo, hi] : null)
        if (kind === 'one') {
          notes = [{ midi: Math.round((lo + hi) / 2) }]
          opts = { noteSeconds: 1.6 }
        } else {
          notes = rangeNotes(lo, hi).map((midi) => ({ midi }))
          opts = { noteSeconds: 0.6, gap: 0.5 }
        }
      }
      setMode(kind)
      await preview.playSequence(i.sound, notes, { ...opts, onNote: (m) => alive.current && setNow(m) })
    } catch (e) {
      if (!alive.current) return
      setErr(e instanceof Error ? e.message : 'Could not play this instrument.')
      setMode('error')
      return
    }
    if (alive.current) {
      setMode('idle')
      setNow(null)
    }
  }

  const busy = mode === 'loading'
  const playing = mode === 'one' || mode === 'range'
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3" data-testid={`listen-${i.sound}`}>
      <button type="button" className="btn btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => run('one')} aria-label={mode === 'one' ? `Stop the ${i.name.toLowerCase()}` : `Hear the ${i.name.toLowerCase()}`}>
        {mode === 'one' ? 'Stop' : busy ? 'Loading…' : i.range ? '▶ Hear it' : '▶ Hear it, soft then loud'}
      </button>
      {i.range && (
        <button type="button" className="btn btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => run('range')} aria-label={mode === 'range' ? `Stop the ${i.name.toLowerCase()}` : `Play the whole range of the ${i.name.toLowerCase()}`}>
          {mode === 'range' ? 'Stop' : '↗ Play the whole range'}
        </button>
      )}
      <span className="min-w-[4rem] font-serif text-xl tabular-nums text-gold" aria-live="off">{playing && now !== null ? noteName(now) : ''}</span>
      {mode === 'error' && <span role="alert" className="text-xs text-ivory-mute">{err}</span>}
      {limit && !playing && <span className="text-xs text-ivory-mute">Recorded range {noteName(limit[0])} – {noteName(limit[1])}</span>}
    </div>
  )
}
