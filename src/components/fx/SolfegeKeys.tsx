import { useCallback, useEffect, useRef, useState } from 'react'
import { MAJOR_STEPS, midiToHz, noteName } from '@/lib/notes'

const START = 60 // Do4
const KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k']

/** Eight keys, Do to Do: click them (or press A S D F G H J K) to hear the major scale and learn the names. */
export function SolfegeKeys() {
  const ctxRef = useRef<AudioContext | null>(null)
  const [lit, setLit] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const play = useCallback((i: number) => {
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : undefined
    setLit(i)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setLit(null), 260)
    if (!Ctor) return
    const ctx = (ctxRef.current ??= new Ctor())
    void ctx.resume()
    const t = ctx.currentTime
    const hz = midiToHz(START + MAJOR_STEPS[i])
    for (const [mult, vol] of [[1, 0.22], [2, 0.07], [3, 0.03]] as const) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = hz * mult
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 1.2)
    }
  }, [])
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const i = KEYS.indexOf(e.key.toLowerCase())
      if (i >= 0) play(i)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [play])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      void ctxRef.current?.close()
      ctxRef.current = null
    },
    [],
  )
  return (
    <div data-testid="solfege-keys">
      <div className="flex gap-1.5" role="group" aria-label="Do-re-mi keyboard">
        {MAJOR_STEPS.map((step, i) => (
          <button
            key={i} type="button" onClick={() => play(i)} aria-label={`${noteName(START + step)}`}
            className={`flex h-36 flex-1 flex-col items-center justify-end rounded-b-md border pb-3 text-sm transition-[background-color,transform,border-color] duration-150 ${lit === i ? 'translate-y-1 border-gold bg-gold/30 text-gold' : 'border-ivory/15 bg-ivory/[.06] text-ivory-dim hover:border-gold/50 hover:bg-ivory/10'}`}
          >
            <span className="font-serif text-xl">{noteName(START + step, { octave: false })}</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-widest text-ivory-mute">{KEYS[i]}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ivory-mute">Do · Re · Mi · Fa · Sol · La · Si · Do — the major scale. “La” is the note the orchestra tunes to. Click the keys or press the letters shown.</p>
    </div>
  )
}
