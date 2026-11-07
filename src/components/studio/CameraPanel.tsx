import { PhaseTag } from '@/components/ui/StatusTag'

/** Phase 1: layout only. No camera is requested here; permission handling arrives in Phase 2. */
export function CameraPanel() {
  return (
    <section className="panel overflow-hidden" aria-labelledby="cam-h">
      <header className="flex items-center justify-between border-b hairline px-4 py-3">
        <h2 id="cam-h" className="font-sans text-sm font-medium tracking-wide">Camera &amp; hand tracking</h2>
        <PhaseTag phase={2} />
      </header>
      <div className="relative aspect-video bg-ink-950">
        <svg viewBox="0 0 160 90" className="absolute inset-0 hidden h-full w-full sm:block" aria-hidden="true">
          <g fill="none" stroke="#c4a35a" strokeOpacity=".18" strokeDasharray="2 3">
            <rect x="12" y="10" width="60" height="70" rx="3" />
            <rect x="88" y="10" width="60" height="70" rx="3" />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-serif text-2xl text-ivory">Camera is off</p>
          <p className="max-w-sm text-sm text-ivory-dim">
            No camera access has been requested and no hand tracking is running. In Phase 2 the camera will be requested only when you press Enable camera.
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-3 flex justify-around text-[11px] uppercase tracking-widest text-ivory-mute">
          <span>Left hand · dynamics</span>
          <span>Right hand · beat</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t hairline p-4">
        <button className="btn btn-gold" disabled>Enable camera</button>
        <button className="btn btn-ghost" disabled>Calibrate</button>
        <button className="btn btn-ghost" disabled>Demo mode</button>
        <label className="ml-auto flex items-center gap-3 text-xs text-ivory-mute">
          Sensitivity
          <input type="range" min={0.5} max={1.5} step={0.05} defaultValue={1} disabled aria-label="Tracking sensitivity" className="accent-gold" />
        </label>
      </div>
    </section>
  )
}
