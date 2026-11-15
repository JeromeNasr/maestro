import { createPersistentStore, createStore, type Store } from '@/lib/store'

/**
 * Performance mode. MAESTRO runs a camera, a hand-tracking model and an orchestra at once, so on a weak device something has
 * to give; Lite gives up decoration first and sound/vision detail second, and keeps everything that affects conducting.
 *
 *   full  every effect on, 640×480 camera, full-rate overlay, convolution hall, 48 kHz audio
 *   lite  no paper grain / blur / background motion, 320×240 camera at ≤ 24 fps, overlay at half rate, no hall reverb,
 *         24 kHz audio (half the memory for the decoded samples), fewer simultaneous voices
 *
 * "auto" picks lite on devices that report few cores or little memory, and switches itself to lite (once, and remembered) if the
 * Studio measures that the page cannot keep up.
 */
export type PerfSetting = 'auto' | 'full' | 'lite'
export type PerfMode = 'full' | 'lite'

export const perfSetting = createPersistentStore<PerfSetting>('maestro.perf.v1', 'auto', (raw) => (raw === 'full' || raw === 'lite' || raw === 'auto' ? raw : 'auto'))
/** Set when the Studio measured that the page is struggling; only matters while the setting is "auto". */
export const autoDowngraded = createPersistentStore<boolean>('maestro.perf.downgraded.v1', false, (raw) => raw === true)

interface Nav { hardwareConcurrency?: number; deviceMemory?: number }

/** True for devices that report very few cores or little memory. Unknown values are never taken as "weak". */
export function looksLowEnd(nav: Nav | undefined = typeof navigator === 'undefined' ? undefined : (navigator as Nav)): boolean {
  if (!nav) return false
  const cores = nav.hardwareConcurrency
  const mem = nav.deviceMemory
  if (typeof cores === 'number' && cores <= 2) return true
  if (typeof mem === 'number' && mem <= 2) return true
  return typeof cores === 'number' && typeof mem === 'number' && cores <= 4 && mem <= 4
}

export function resolvePerf(setting: PerfSetting, downgraded: boolean, lowEnd: boolean): PerfMode {
  if (setting === 'full' || setting === 'lite') return setting
  return downgraded || lowEnd ? 'lite' : 'full'
}

const current = (): PerfMode => resolvePerf(perfSetting.get(), autoDowngraded.get(), looksLowEnd())

/** The mode in force right now (a store, so UI and effects can follow it). */
export const perfMode: Store<PerfMode> = createStore<PerfMode>(current())
const refresh = () => perfMode.set(current())
perfSetting.subscribe(refresh)
autoDowngraded.subscribe(refresh)

export const isLite = () => perfMode.get() === 'lite'

/** Called by the Studio when frames are consistently slow. Does nothing unless the setting is "auto". */
export function downgradeIfAuto(): boolean {
  if (perfSetting.get() !== 'auto' || autoDowngraded.get()) return false
  autoDowngraded.set(true)
  return true
}

/**
 * Watches frame pacing. Calls `onSlow` once if the median frame time stays above `slowMs` for `windows` consecutive one-second
 * windows (a single hiccup, a tab switch or a window drag does not count). Returns a stop function.
 */
export function watchFramePacing(onSlow: () => void, opts: { slowMs?: number; windows?: number; raf?: (cb: FrameRequestCallback) => number; caf?: (id: number) => void; now?: () => number } = {}): () => void {
  const slowMs = opts.slowMs ?? 34
  const need = opts.windows ?? 5
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb))
  const caf = opts.caf ?? ((id) => cancelAnimationFrame(id))
  const now = opts.now ?? (() => performance.now())
  let id = 0
  let last = now()
  let windowStart = last
  let gaps: number[] = []
  let slowRun = 0
  let stopped = false
  const tick = () => {
    if (stopped) return
    const t = now()
    const dt = t - last
    last = t
    if (dt < 1000) gaps.push(dt) // a long pause (hidden tab) is not a slow frame
    if (t - windowStart >= 1000) {
      if (gaps.length >= 5) {
        const s = [...gaps].sort((a, b) => a - b)
        slowRun = s[s.length >> 1] > slowMs ? slowRun + 1 : 0
        if (slowRun >= need) {
          stopped = true
          onSlow()
          return
        }
      }
      gaps = []
      windowStart = t
    }
    id = raf(tick)
  }
  id = raf(tick)
  return () => {
    stopped = true
    caf(id)
  }
}
