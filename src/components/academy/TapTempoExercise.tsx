import { useEffect, useRef, useState } from 'react'
import { evaluateTaps, TAPS_REQUIRED, type TapResult } from '@/academy/exercises'
import type { ExerciseDef } from '@/academy/lessons'
import { recordExercise } from '@/academy/progress'

/** Tap along to a visual pulse. Judged from the tap times on accuracy and steadiness (no camera needed). */
export function TapTempoExercise({ lessonId, def }: { lessonId: string; def: ExerciseDef }) {
  const target = def.targetBpm ?? 80
  const [taps, setTaps] = useState<number[]>([])
  const [result, setResult] = useState<TapResult | null>(null)
  const recorded = useRef(false)

  const tap = () => {
    if (result) return
    const now = performance.now()
    setTaps((prev) => {
      const next = [...prev, now].slice(-TAPS_REQUIRED * 2)
      if (next.length >= TAPS_REQUIRED) {
        const r = evaluateTaps(next.slice(-TAPS_REQUIRED), target)
        if (r.bpm !== null) {
          setResult(r)
          if (!recorded.current) {
            recorded.current = true
            recordExercise(lessonId, def.id, r.score, r.passed)
          }
        }
      }
      return next
    })
  }
  const reset = () => {
    setTaps([])
    setResult(null)
    recorded.current = false
  }

  // Space also taps while the pad has focus (the button's own click handles Enter/Space natively).
  const padRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    padRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="space-y-4" data-testid={`exercise-${def.id}`}>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative flex h-24 w-24 items-center justify-center" aria-hidden="true">
          <span className="absolute h-16 w-16 rounded-full border border-gold/50" style={{ animation: `pulseRing ${60 / target}s ease-out infinite` }} />
          <span className="h-5 w-5 rounded-full bg-gold" />
        </div>
        <div>
          <p className="text-sm text-ivory-dim">Target: <span className="text-ivory">{target} BPM</span> — one tap per pulse.</p>
          <button ref={padRef} className="btn btn-gold mt-3 !px-10 !py-4 text-base" onClick={tap} disabled={!!result}>Tap</button>
        </div>
      </div>
      <p className="text-sm text-ivory-mute" aria-live="polite">
        {result ? '' : taps.length === 0 ? `Tap ${TAPS_REQUIRED} times with the pulse.` : `${taps.length} of ${TAPS_REQUIRED} taps…`}
      </p>
      {result && (
        <div role="status" className="space-y-1 border-l-2 border-gold/60 pl-4 text-sm" data-testid="tap-result">
          <p className="text-ivory">{result.passed ? 'Passed' : 'Not passed yet'} — score {Math.round(result.score)}</p>
          <p className="text-ivory-dim">Your tempo {result.bpm!.toFixed(1)} BPM (error {result.tempoErrorPct!.toFixed(1)}%, needs ≤ 8%) · steadiness {result.steadinessPct!.toFixed(1)}% (needs ≤ 12%)</p>
          <button className="btn btn-ghost mt-2" onClick={reset}>Try again</button>
        </div>
      )}
    </div>
  )
}
