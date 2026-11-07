import { useEffect, useRef, useState } from 'react'
import { DynamicsExercise, PatternExercise, type DynamicsState, type PatternState } from '@/academy/exercises'
import type { ExerciseDef } from '@/academy/lessons'
import { recordExercise } from '@/academy/progress'
import { StatusTag } from '@/components/ui/StatusTag'
import { useStore } from '@/lib/store'
import { ExerciseCamera } from './ExerciseCamera'
import { useGestureInput } from './useGestureInput'

type Live = { kind: 'pattern'; state: PatternState } | { kind: 'dynamics'; state: DynamicsState }

/**
 * Exercises judged by the real gesture recogniser from your webcam. They are optional (they need a camera) and are
 * recorded as passed ONLY if the recogniser actually measured it.
 */
export function CameraExercise({ lessonId, def }: { lessonId: string; def: ExerciseDef }) {
  const input = useGestureInput()
  const vision = useStore(input.vision.store)
  const [running, setRunning] = useState(false)
  const [live, setLive] = useState<Live | null>(null)
  const [outcome, setOutcome] = useState<{ passed: boolean; score: number; note: string } | null>(null)
  const evaluator = useRef<PatternExercise | DynamicsExercise | null>(null)
  const lastUi = useRef(0)
  const cameraLive = vision.status === 'running' && vision.source === 'camera'

  // Feed the evaluator from the gesture engine while the exercise is running.
  useEffect(() => {
    if (!running) return
    const unsub = input.onProcessed(({ events, snapshot, frame }) => {
      const ev = evaluator.current
      if (!ev) return
      const t = frame.timestampMs
      if (ev instanceof PatternExercise) ev.feed(events, snapshot, t)
      else ev.feed(snapshot, t)
      const done = ev instanceof PatternExercise ? ev.state.passed || ev.state.timedOut : ev.state.passed || ev.state.failed
      if (done || t - lastUi.current > 150) {
        lastUi.current = t
        setLive(ev instanceof PatternExercise ? { kind: 'pattern', state: ev.state } : { kind: 'dynamics', state: ev.state })
      }
      if (done) {
        const st = ev.state
        recordExercise(lessonId, def.id, st.score, st.passed)
        setOutcome({ passed: st.passed, score: st.score, note: st.passed ? 'Measured by the recogniser from your hands.' : ev instanceof PatternExercise ? 'Time ran out before three clean bars.' : 'A marking was not reached in time.' })
        setRunning(false)
      }
    })
    return unsub
  }, [running, input, lessonId, def])

  const start = () => {
    setOutcome(null)
    setLive(null)
    if (def.kind === 'dynamics') evaluator.current = new DynamicsExercise()
    else {
      const ts = def.timeSignature ?? '4/4'
      input.setTimeSignature(ts)
      input.engine.reset()
      evaluator.current = new PatternExercise({
        timeSignature: ts,
        barsRequired: def.kind === 'both-hands' ? 2 : 3,
        gate: def.kind === 'both-hands' ? (s) => s.dynamics.source === 'hand' && (s.dynamics.mark === 'f' || s.dynamics.mark === 'ff') : undefined,
      })
    }
    setRunning(true)
  }

  return (
    <div className="space-y-4" data-testid={`exercise-${def.id}`}>
      <ExerciseCamera input={input} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-gold !py-2" disabled={!cameraLive || running} onClick={start}>{outcome ? 'Try again' : 'Start exercise'}</button>
        {running && <button className="btn btn-ghost !py-2" onClick={() => setRunning(false)}>Stop</button>}
        {!cameraLive && <span className="text-xs text-ivory-mute">Enable the camera first. For best results calibrate in the Studio once.</span>}
      </div>
      {live?.kind === 'pattern' && (
        <p role="status" className="text-sm text-ivory-dim" data-testid="exercise-live">
          Clean bars in a row: <span className="text-ivory">{live.state.consecutiveBars}/{live.state.barsRequired}</span> · beat {live.state.beatInBar || '—'} · stray strokes {live.state.offPattern}
        </p>
      )}
      {live?.kind === 'dynamics' && (
        <div role="status" className="text-sm text-ivory-dim" data-testid="exercise-live">
          Show <span className="font-serif text-xl italic text-gold">{live.state.targets[live.state.index]}</span> and hold ({live.state.reached}/{live.state.targets.length} done)
          <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-sm bg-ink-600"><div className="h-full bg-gold transition-[width] duration-100" style={{ width: `${live.state.holdProgress * 100}%` }} /></div>
        </div>
      )}
      {outcome && (
        <p role="status" className="border-l-2 border-gold/60 pl-4 text-sm text-ivory" data-testid="exercise-outcome">
          {outcome.passed ? 'Passed' : 'Not passed'} — score {Math.round(outcome.score)} <StatusTag kind="measured" /> <span className="text-ivory-mute">{outcome.note}</span>
        </p>
      )}
    </div>
  )
}
