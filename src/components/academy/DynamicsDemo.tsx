import { useState } from 'react'
import { DYNAMIC_NAMES, markForLevel } from '@/gesture/dynamicsMapper'
import { gestureSettings } from '@/config/settings'
import { useStore } from '@/lib/store'
import { DynamicsMeter } from '@/components/studio/Visualizers'

export function DynamicsDemo() {
  const [level, setLevel] = useState(0.5)
  const cfg = useStore(gestureSettings)
  const mark = markForLevel(level, cfg.dynamics.boundaries)
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <DynamicsMeter level={level} />
      <div className="space-y-3">
        <label className="block text-sm text-ivory-dim">
          Simulated left-hand height
          <input type="range" min={0} max={1} step={0.01} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="mt-2 w-full accent-gold" />
        </label>
        <p className="font-serif text-4xl italic text-gold" data-testid="dynamic-mark">{mark}</p>
        <p className="text-sm text-ivory-dim">{DYNAMIC_NAMES[mark]}</p>
        <p className="text-xs text-ivory-mute">A slider stands in for your hand here. No camera or sound is involved.</p>
      </div>
    </div>
  )
}
