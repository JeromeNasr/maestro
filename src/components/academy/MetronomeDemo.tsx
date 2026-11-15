import { useEffect, useRef, useState } from 'react'

/** A swinging metronome at the chosen tempo; optional click. The swing is a CSS animation (one beat per half swing). */
export function MetronomeDemo() {
  const [bpm, setBpm] = useState(72)
  const [click, setClick] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    if (!click) return
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : undefined
    if (!Ctor) return
    const ctx = (ctxRef.current ??= new Ctor())
    void ctx.resume()
    const tick = () => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'triangle'
      o.frequency.value = 1100
      g.gain.setValueAtTime(0.0001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07)
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.09)
    }
    const id = setInterval(tick, 60000 / bpm)
    return () => clearInterval(id)
  }, [click, bpm])
  useEffect(
    () => () => {
      void ctxRef.current?.close()
      ctxRef.current = null
    },
    [],
  )
  const name = bpm < 60 ? 'Largo' : bpm < 76 ? 'Adagio' : bpm < 108 ? 'Andante' : bpm < 120 ? 'Moderato' : bpm < 168 ? 'Allegro' : 'Presto'
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,150px)_1fr]">
      <div className="relative mx-auto h-44 w-28" role="img" aria-label={`Metronome at ${bpm} beats per minute`}>
        <svg viewBox="0 0 100 150" className="h-full w-full">
          <path d="M20 146 L36 14 H64 L80 146 Z" fill="#1a1714" stroke="#c4a35a" strokeOpacity=".5" />
          <g style={{ transformOrigin: '50px 134px', animation: `swing ${60 / bpm}s ease-in-out infinite alternate` }}>
            <line x1="50" y1="134" x2="50" y2="22" stroke="#f3ecdc" strokeWidth="2" strokeLinecap="round" />
            <rect x="44" y="52" width="12" height="16" rx="2" fill="#c4a35a" />
          </g>
          <circle cx="50" cy="134" r="4" fill="#c4a35a" />
        </svg>
      </div>
      <div className="space-y-3">
        <p className="font-serif text-4xl italic text-gold">{name}</p>
        <label className="flex items-center gap-3 text-sm text-ivory-dim">
          Tempo
          <input type="range" min={40} max={180} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} aria-label="Metronome tempo in beats per minute" className="min-w-0 flex-1 accent-gold" />
          <span className="w-16 text-right tabular-nums text-ivory">{bpm} BPM</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ivory-dim">
          <input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} className="accent-gold" aria-label="Metronome click" />
          Click (sound)
        </label>
        <p className="text-xs text-ivory-mute">Each swing from one side to the other is one beat. The Italian word is the traditional name for the tempo.</p>
      </div>
    </div>
  )
}
