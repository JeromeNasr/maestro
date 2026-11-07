import type { ConductingSession } from '@/conducting/conductingSession'
import { StatusTag } from '@/components/ui/StatusTag'
import { useStudio, useVision } from './useConductingSession'

/** Controls for the synthetic "virtual conductor" (demonstration mode). Shown only while it is running. */
export function DemoConductorPanel({ session }: { session: ConductingSession }) {
  const v = useVision(session)
  const { demo } = useStudio(session)
  if (v.source !== 'demo' || v.status === 'idle') return null
  return (
    <section className="panel p-4" aria-labelledby="demo-h">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="demo-h" className="font-sans text-sm font-medium tracking-wide">Virtual conductor</h2>
        <StatusTag kind="demo">Synthetic hands — not your camera</StatusTag>
      </header>
      <p className="mt-2 text-xs leading-relaxed text-ivory-mute">
        A simulated conductor drives the same recogniser as your real hands, so you can hear tempo and dynamics follow without a camera. Sessions are recorded as “demo”, never as your own conducting.
      </p>
      <div className="mt-4 space-y-4 text-sm">
        <label className="flex items-center gap-3 text-ivory-dim">
          <span className="w-28 shrink-0">Right hand tempo</span>
          <input type="range" min={40} max={200} value={demo.bpm} onChange={(e) => session.setDemoBpm(Number(e.target.value))} aria-label="Virtual conductor tempo in beats per minute" className="min-w-0 flex-1 accent-gold" />
          <span className="w-14 text-right tabular-nums text-ivory">{demo.bpm}</span>
        </label>
        <label className="flex items-center gap-3 text-ivory-dim">
          <span className="w-28 shrink-0">Left hand height</span>
          <input
            type="range" min={0} max={1} step={0.01} value={demo.leftLevel ?? 0.5} disabled={demo.leftLevel === null}
            onChange={(e) => session.setDemoLeftLevel(Number(e.target.value))} aria-label="Virtual conductor left hand height" className="min-w-0 flex-1 accent-gold"
          />
          <span className="w-14 text-right tabular-nums text-ivory">{demo.leftLevel === null ? 'auto' : demo.leftLevel.toFixed(2)}</span>
        </label>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-ivory-dim">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={demo.leftLevel === null} onChange={(e) => session.setDemoLeftLevel(e.target.checked ? null : 0.5)} className="accent-gold" />
            Left hand waves by itself
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={demo.dropouts} onChange={(e) => session.setDemoDropouts(e.target.checked)} className="accent-gold" />
            Simulate tracking dropouts
          </label>
        </div>
      </div>
    </section>
  )
}
