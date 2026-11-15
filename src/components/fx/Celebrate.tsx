import { useEffect, useMemo } from 'react'

const BITS = ['♪', '♫', '♩', '✦', '●', '♬']
/** A small burst of notes and gold confetti with a "Bravo!" — shown for a moment when something is achieved. */
export function Celebrate({ show, label = 'Bravo!', onDone }: { show: boolean; label?: string; onDone?: () => void }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.2
        const r = 90 + ((i * 37) % 80)
        return { dx: Math.cos(a) * r, dy: Math.sin(a) * r - 40, rot: ((i * 53) % 360) - 180, delay: (i % 5) * 0.03, size: 14 + ((i * 7) % 12), g: BITS[i % BITS.length], gold: i % 3 !== 0 }
      }),
    [],
  )
  useEffect(() => {
    if (!show || !onDone) return
    const t = setTimeout(onDone, 2400)
    return () => clearTimeout(t)
  }, [show, onDone])
  if (!show) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" role="status" aria-live="polite">
      <div className="absolute left-1/2 top-1/3 -translate-x-1/2">
        <p className="bravo font-serif text-6xl italic text-gold drop-shadow-[0_2px_12px_rgba(0,0,0,.6)]">{label}</p>
      </div>
      <div className="absolute left-1/2 top-[38%]" aria-hidden="true">
        {bits.map((b, i) => (
          <span key={i} className="confetti font-serif" style={{ fontSize: b.size, color: b.gold ? '#d9bf82' : '#f3ecdc', ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, ['--rot' as string]: `${b.rot}deg`, ['--delay' as string]: `${b.delay}s` }}>
            {b.g}
          </span>
        ))}
      </div>
    </div>
  )
}
