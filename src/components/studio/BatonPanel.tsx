import type { ConductingSession } from '@/conducting/conductingSession'
import { StatusTag } from '@/components/ui/StatusTag'
import { gestureSettings } from '@/config/settings'
import { useStore } from '@/lib/store'

const swatch = (c: { h: number; s: number; v: number }) => `hsl(${Math.round(c.h)} ${Math.round(c.s * 100)}% ${Math.round(c.v * 100 * (1 - c.s / 2))}%)`

/**
 * Baton mode. Honest about what it is: the tip is found by a COLOURED MARKER that the user points out once, so it works
 * in whatever light the room has; there is no pretending to find a bare stick. Nothing here changes conducting until the
 * switch is on and the marker has been picked.
 */
export function BatonPanel({ session }: { session: ConductingSession }) {
  const cfg = useStore(gestureSettings)
  const baton = session.vision.baton
  const status = useStore(baton.store)
  const camera = useStore(session.vision.store)
  const live = camera.status === 'running' && camera.source === 'camera'
  const demo = camera.status === 'running' && camera.source === 'demo'
  const b = cfg.baton
  const set = (patch: Partial<typeof b>) => gestureSettings.set({ ...cfg, baton: { ...b, ...patch } })

  const stateText = !b.enabled
    ? 'Off'
    : status.state === 'needs-color' && !demo
      ? 'Pick the marker colour'
      : status.state === 'tracking'
        ? `Tip found · ${Math.round(status.confidence * 100)}%`
        : status.state === 'searching'
          ? 'Looking for the marker…'
          : demo
            ? 'Demonstration tip'
            : ''
  return (
    <section className="panel p-4" aria-labelledby="baton-h" data-testid="baton-panel">
      <header className="flex items-center justify-between gap-2">
        <h2 id="baton-h" className="font-sans text-sm font-medium tracking-wide">Baton</h2>
        <StatusTag kind="estimate">Experimental</StatusTag>
      </header>
      <label className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-ivory">Follow my baton tip</span>
        <input type="checkbox" checked={b.enabled} aria-label="Follow my baton tip" onChange={(e) => set({ enabled: e.target.checked })} className="accent-gold" />
      </label>
      <p className="mt-1.5 text-xs leading-relaxed text-ivory-mute">
        Put a vivid marker on the tip — tape, a sticker or a small ball in green, blue, pink or orange — then pick it once in the camera preview. The tip is much easier to read than a hand, and it keeps working when your fist hides your fingers.
      </p>

      {b.enabled && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button className={`btn !px-3 !py-1.5 text-xs ${status.picking ? 'btn-gold' : 'btn-ghost'}`} disabled={!live} aria-pressed={status.picking} onClick={() => baton.setPicking(!status.picking)} title={live ? undefined : 'Needs the live camera'}>
              {status.picking ? 'Click the marker in the preview…' : b.color ? 'Pick again' : 'Pick marker colour'}
            </button>
            {b.color && (
              <>
                <span className="inline-flex items-center gap-2 text-xs text-ivory-dim">
                  <span className="inline-block h-4 w-4 rounded-full border border-ivory/30" style={{ background: swatch(b.color) }} aria-hidden="true" />
                  marker colour saved
                </span>
                <button className="text-xs text-ivory-mute hover:text-gold-soft" onClick={() => baton.clearColor()}>Clear</button>
              </>
            )}
          </div>
          {!live && !demo && <p className="text-xs text-ivory-mute">Enable the camera to pick the marker.</p>}
          {status.picking && <p className="text-xs text-gold-soft" role="status">Click the coloured tip in the camera picture above.</p>}
          {status.warning && <p role="alert" className="text-xs text-gold-soft" data-testid="baton-warning">{status.warning}</p>}

          <label className="flex items-center gap-3 text-ivory-dim">
            <span className="w-24 shrink-0 text-xs">Tolerance</span>
            <input type="range" min={0} max={1} step={0.05} value={b.tolerance} aria-label="Baton colour tolerance" onChange={(e) => set({ tolerance: Number(e.target.value) })} className="min-w-0 flex-1 accent-gold" />
            <span className="w-16 text-right text-xs text-ivory">{b.tolerance < 0.35 ? 'strict' : b.tolerance > 0.65 ? 'forgiving' : 'medium'}</span>
          </label>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ivory-dim">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={b.useForBeats} aria-label="Use the baton tip for the beat" onChange={(e) => set({ useForBeats: e.target.checked })} className="accent-gold" />
              Use the tip for the beat
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={status.showMask} aria-label="Show what the tracker sees" onChange={(e) => baton.setShowMask(e.target.checked)} className="accent-gold" />
              Show what it sees
            </label>
          </div>
          <p role="status" className="min-h-[1.25rem] text-xs text-gold-soft" data-testid="baton-status">
            {stateText}
            {status.matchPercent !== null && status.state !== 'off' ? ` · ${status.matchPercent}% of the picture matches` : ''}
          </p>
        </div>
      )}
    </section>
  )
}
