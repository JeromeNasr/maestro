const GLYPHS = ['♪', '♫', '♩', '♬', '♪', '♫']
// hand-placed rather than random, so the pattern looks composed and never changes between renders
const SPOTS: { left: number; size: number; dur: number; delay: number; sway: number; alpha: number }[] = [
  { left: 6, size: 30, dur: 19, delay: 0, sway: 24, alpha: 0.3 },
  { left: 17, size: 22, dur: 24, delay: 6, sway: -18, alpha: 0.22 },
  { left: 29, size: 36, dur: 21, delay: 12, sway: 30, alpha: 0.26 },
  { left: 43, size: 20, dur: 26, delay: 3, sway: -22, alpha: 0.2 },
  { left: 58, size: 28, dur: 20, delay: 9, sway: 20, alpha: 0.28 },
  { left: 71, size: 34, dur: 23, delay: 15, sway: -26, alpha: 0.24 },
  { left: 84, size: 24, dur: 18, delay: 5, sway: 18, alpha: 0.3 },
  { left: 93, size: 30, dur: 25, delay: 11, sway: -20, alpha: 0.22 },
]

/** A few music notes drifting up the page. Pure CSS, decorative, off for reduced motion and in Lite mode. */
export function FloatingNotes({ count = SPOTS.length, className = '' }: { count?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {SPOTS.slice(0, count).map((s, i) => (
        <span
          key={i} className="float-note"
          style={{ left: `${s.left}%`, fontSize: s.size, ['--dur' as string]: `${s.dur}s`, ['--delay' as string]: `-${s.delay}s`, ['--sway' as string]: `${s.sway}px`, ['--note-alpha' as string]: s.alpha }}
        >
          {GLYPHS[i % GLYPHS.length]}
        </span>
      ))}
    </div>
  )
}
