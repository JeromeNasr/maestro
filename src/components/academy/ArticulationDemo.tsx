import { useEffect, useRef, useState } from 'react'

export type Articulation = 'legato' | 'staccato' | 'marcato'

/**
 * Height of the baton tip (0 = the ictus / lowest point, 1 = top of the rebound) over one beat, φ ∈ [0, 1).
 *  legato:   continuous, rounded — the tip never stops
 *  staccato: a quick drop, a crisp rebound and a short stillness
 *  marcato:  a strong, weighted drop with a firm stop at the ictus, then a deliberate lift
 */
export function tipHeight(kind: Articulation, phi: number): number {
  const p = ((phi % 1) + 1) % 1
  if (kind === 'legato') return 0.5 + 0.5 * Math.cos(2 * Math.PI * p)
  if (kind === 'staccato') {
    if (p < 0.12) return 1 - p / 0.12 // quick drop
    if (p < 0.3) return (p - 0.12) / 0.18 // rebound
    return 1 // still at the top until the next beat
  }
  if (p < 0.2) return 1 - (p / 0.2) ** 2 // accelerating, heavy drop
  if (p < 0.34) return 0 // firm stop at the ictus
  return ((p - 0.34) / 0.66) ** 0.8 // lift
}

const COPY: Record<Articulation, { title: string; text: string; sound: string }> = {
  legato: { title: 'Legato — connected', text: 'The tip flows through the ictus without stopping, like a bouncing ball in slow motion. The beat is felt, not hit.', sound: 'Long, smooth, joined notes.' },
  staccato: { title: 'Staccato — short', text: 'A small, quick drop to the ictus and an equally quick rebound, then stillness before the next beat. The silence between is part of the gesture.', sound: 'Short, separated notes.' },
  marcato: { title: 'Marcato — accented', text: 'A weighted, firm stroke that arrives at the ictus and stops there for an instant before the lift. More energy, more arm.', sound: 'Strong, stressed notes.' },
}

/** Animated baton tip for three articulations, with the effect of gesture size and tempo. */
export function ArticulationDemo() {
  const [kind, setKind] = useState<Articulation>('legato')
  const [bpm, setBpm] = useState(72)
  const [size, setSize] = useState(0.6)
  const [phi, setPhi] = useState(0)
  const [playing, setPlaying] = useState(true)
  const ref = useRef(0)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!playing || reduced) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      ref.current += ((now - last) / 1000) * (bpm / 60)
      last = now
      setPhi(ref.current % 1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, bpm, reduced])

  const top = 82 - 60 * size // top of the rebound (SVG y); the ictus is always at y = 82
  const y = 82 + (top - 82) * tipHeight(kind, reduced ? 1 : phi)
  const trail = Array.from({ length: 36 }, (_, i) => {
    const q = phi - (i * 0.012)
    return `${i === 0 ? 'M' : 'L'}${50 - i * 0.7} ${82 + (top - 82) * tipHeight(kind, q)}`
  }).join(' ')
  const c = COPY[kind]
  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,260px)_1fr]">
      <svg viewBox="0 0 100 100" className="aspect-square w-full rounded-sm border hairline bg-ink-950" role="img" aria-label={`Baton tip path for ${kind}`}>
        <line x1="20" y1="82" x2="80" y2="82" stroke="#c4a35a" strokeOpacity=".4" strokeDasharray="2 2" />
        <text x="82" y="85" fontSize="5" fill="#c9c0ad">ictus</text>
        <path d={trail} fill="none" stroke="#c4a35a" strokeOpacity=".35" strokeWidth="1.2" />
        <line x1="50" y1="96" x2="50" y2={y} stroke="#f3ecdc" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="50" cy={y} r="3" fill="#c4a35a" />
      </svg>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Articulation" className="flex flex-wrap gap-2">
          {(Object.keys(COPY) as Articulation[]).map((k) => (
            <button key={k} role="radio" aria-checked={k === kind} className={`btn !px-3 !py-1.5 ${k === kind ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setKind(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <div aria-live="polite">
          <h4 className="font-serif text-2xl text-gold">{c.title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-ivory-dim">{c.text}</p>
          <p className="mt-1 text-sm text-ivory">The orchestra answers with: {c.sound}</p>
        </div>
        <label className="flex items-center gap-3 text-sm text-ivory-dim">
          Gesture size
          <input type="range" min={0.2} max={1} step={0.01} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-gold" aria-label="Gesture size" />
          <span className="w-24 text-right text-ivory">{size < 0.4 ? 'small · softer' : size < 0.75 ? 'medium · moderate' : 'large · louder'}</span>
        </label>
        <label className="flex items-center gap-3 text-sm text-ivory-dim">
          Tempo
          <input type="range" min={40} max={140} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="flex-1 accent-gold" aria-label="Demonstration tempo in BPM" />
          <span className="w-24 text-right tabular-nums text-ivory">{bpm} BPM</span>
        </label>
        <button className="btn btn-ghost" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>{playing ? 'Pause animation' : 'Resume animation'}</button>
        {reduced && <p className="text-xs text-ivory-mute">Animation is off because your system prefers reduced motion; the drawing shows the top of each stroke.</p>}
        <p className="text-xs text-ivory-mute">Size and character are conventions you can feel in your own conducting. In MAESTRO, the loudness comes from your left hand; the right hand’s size and articulation are for your own and a human orchestra’s benefit.</p>
      </div>
    </div>
  )
}
