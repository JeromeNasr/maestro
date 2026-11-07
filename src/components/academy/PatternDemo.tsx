import { useEffect, useRef, useState } from 'react'
import { positionAt, TEACHING_PATTERNS } from '@/academy/patternGeometry'
import type { TimeSignature } from '@/config/gestureConfig'

/** Animated conducting pattern. The animation loop is cancelled on unmount and when paused. */
export function PatternDemo({ timeSignature }: { timeSignature: TimeSignature }) {
  const pattern = TEACHING_PATTERNS[timeSignature]
  const [bpm, setBpm] = useState(80)
  const [playing, setPlaying] = useState(true)
  const [view, setView] = useState({ x: pattern.ictus[0].x, y: pattern.ictus[0].y, beat: 0 })
  const beatsRef = useRef(0)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!playing || reduced) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      beatsRef.current += ((now - last) / 1000) * (bpm / 60)
      last = now
      const { point, beat } = positionAt(pattern, beatsRef.current)
      setView({ x: point.x, y: point.y, beat })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, bpm, pattern, reduced])

  const path = pattern.ictus.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,260px)_1fr]">
      <svg viewBox="0 0 100 100" className="aspect-square w-full rounded-sm border hairline bg-ink-950" role="img" aria-label={`${timeSignature} conducting pattern: ${pattern.strokes.join(', ')}`}>
        <path d={path} fill="none" stroke="#c4a35a" strokeOpacity=".3" strokeDasharray="1.5 2" />
        {pattern.ictus.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.2" fill="none" stroke="#c4a35a" strokeOpacity={view.beat === i ? 1 : 0.4} />
            <text x={p.x + 5} y={p.y - 4} fontSize="6" fill="#c9c0ad">{i + 1}</text>
          </g>
        ))}
        <circle cx={view.x} cy={view.y} r="3.6" fill="#c4a35a" />
      </svg>
      <div className="space-y-4">
        <ol className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {pattern.strokes.map((s, i) => (
            <li key={i} className={view.beat === i ? 'text-gold' : 'text-ivory-dim'}>{i + 1} · {s}</li>
          ))}
        </ol>
        <label className="flex items-center gap-3 text-sm text-ivory-dim">
          Tempo
          <input type="range" min={40} max={160} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="flex-1 accent-gold" aria-label="Demonstration tempo in BPM" />
          <span className="w-16 text-right tabular-nums text-ivory">{bpm} BPM</span>
        </label>
        <button className="btn btn-ghost" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
          {playing ? 'Pause animation' : 'Resume animation'}
        </button>
        {reduced && <p className="text-xs text-ivory-mute">Animation is off because your system prefers reduced motion.</p>}
        <p className="text-xs text-ivory-mute">This animation shows the movement to copy. It does not use your camera and plays no sound.</p>
      </div>
    </div>
  )
}
