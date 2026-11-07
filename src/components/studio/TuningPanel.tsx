import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { gestureSettings, resetGestureSettings } from '@/config/settings'
import { clampParam, TUNING_PARAMS } from '@/config/tuning'
import { useStore } from '@/lib/store'

const GROUPS = ['Beats', 'Tempo', 'Dynamics', 'Cues'] as const

/** Live, persisted adjustment of the recogniser's thresholds — for fitting MAESTRO to your camera and conducting style. */
export function TuningPanel() {
  const cfg = useStore(gestureSettings)
  const changed = TUNING_PARAMS.filter((p) => p.get(cfg) !== p.get(DEFAULT_GESTURE_CONFIG)).length
  return (
    <details className="panel p-4">
      <summary className="cursor-pointer font-sans text-sm font-medium tracking-wide">Tuning {changed > 0 && <span className="ml-2 text-xs text-gold-soft">{changed} changed</span>}</summary>
      <p className="mt-3 text-xs leading-relaxed text-ivory-mute">
        Thresholds of the gesture recogniser. Changes apply immediately and are remembered in this browser. The defaults were set with simulated hands, so you may want to adjust them for your camera.
      </p>
      <div className="mt-4 space-y-5">
        {GROUPS.map((g) => (
          <fieldset key={g}>
            <legend className="text-[11px] uppercase tracking-widest text-ivory-mute">{g}</legend>
            <div className="mt-2 space-y-3">
              {TUNING_PARAMS.filter((p) => p.group === g).map((p) => {
                const v = p.get(cfg)
                const isDefault = v === p.get(DEFAULT_GESTURE_CONFIG)
                return (
                  <label key={p.id} className="block text-sm text-ivory-dim" title={p.help}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span>{p.label}</span>
                      <span className={`tabular-nums ${isDefault ? 'text-ivory-mute' : 'text-gold-soft'}`}>{Number(v.toFixed(2))}{p.unit ? ` ${p.unit}` : ''}</span>
                    </span>
                    <input
                      type="range" min={p.min} max={p.max} step={p.step} value={v} aria-label={p.label} aria-describedby={`tune-${p.id}`}
                      onChange={(e) => gestureSettings.set((c) => p.set(c, clampParam(p, Number(e.target.value))))} className="mt-1 w-full accent-gold"
                    />
                    <span id={`tune-${p.id}`} className="block text-[11px] text-ivory-mute">{p.help}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))}
        <fieldset>
          <legend className="text-[11px] uppercase tracking-widest text-ivory-mute">Optional gestures</legend>
          <label className="mt-2 flex items-start gap-2 text-sm text-ivory-dim">
            <input type="checkbox" checked={cfg.cues.openPalmPauseEnabled} onChange={(e) => gestureSettings.set((c) => ({ ...c, cues: { ...c.cues, openPalmPauseEnabled: e.target.checked } }))} className="mt-1 accent-gold" />
            <span>Open right palm, held still, pauses / resumes <span className="text-ivory-mute">(experimental — off until proven reliable on your camera)</span></span>
          </label>
        </fieldset>
        <button className="btn btn-ghost !py-2" disabled={changed === 0 && !cfg.cues.openPalmPauseEnabled} onClick={() => resetGestureSettings()}>Reset all to defaults</button>
      </div>
    </details>
  )
}
