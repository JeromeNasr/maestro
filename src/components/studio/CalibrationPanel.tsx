import type { CalibrationState } from '@/vision/calibration'

interface Props {
  state: CalibrationState
  onCancel: () => void
  onRetry: () => void
}

/** Overlay card shown over the camera view while calibrating, and for the result. */
export function CalibrationPanel({ state, onCancel, onRetry }: Props) {
  if (state.step === 'idle') return null
  const done = state.step === 'complete'
  const failed = state.step === 'failed'
  const p = state.profile
  return (
    <div className="absolute inset-x-3 bottom-10 rounded-sm border border-gold/40 bg-ink-950/90 p-4 backdrop-blur" role="group" aria-label="Calibration">
      <p className="eyebrow">{failed ? 'Calibration' : done ? 'Calibration' : 'Calibrating'}</p>
      <h3 className="mt-1 text-xl">{state.title}</h3>
      {!done && !failed && <p className="mt-1 text-sm text-ivory-dim">{state.instruction}</p>}
      {state.hint && <p role="status" className="mt-2 text-sm text-gold-soft">{state.hint}</p>}
      {failed && <p role="alert" className="mt-2 text-sm text-ivory-dim">{state.failure}</p>}
      {done && p && (
        <div className="mt-2 space-y-1 text-sm text-ivory-dim">
          <p>
            Left/right labels:{' '}
            <span className="text-ivory">
              {p.handedness.swap ? 'the detector reported your hands the wrong way round; MAESTRO now corrects this.' : 'the detector’s labels matched your hands; no correction needed.'}
            </span>{' '}
            (verified against the mirrored preview)
          </p>
          <p>
            Range captured: left {p.ranges.left ? 'yes' : 'no'}, right {p.ranges.right ? 'yes' : 'no'}.
          </p>
          {p.warnings.map((w) => <p key={w} className="text-gold-soft">{w}</p>)}
        </div>
      )}
      {!done && !failed && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-ink-600" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)} aria-label="Calibration step progress">
          <div className="h-full bg-gold transition-all duration-150" style={{ width: `${Math.round(state.progress * 100)}%` }} />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {failed && <button className="btn btn-gold !py-1.5" onClick={onRetry}>Try again</button>}
        <button className="btn btn-ghost !py-1.5" onClick={onCancel}>{done || failed ? 'Dismiss' : 'Cancel calibration'}</button>
      </div>
    </div>
  )
}
