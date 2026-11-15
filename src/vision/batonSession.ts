import type { GestureConfig } from '@/config/gestureConfig'
import { gestureSettings } from '@/config/settings'
import { createStore, type Store } from '@/lib/store'
import { BatonTracker, matchFraction, pickColor, type PickResult, type Pixels } from './batonTracker'
import type { BatonColor, BatonSample } from './types'

export type BatonState = 'off' | 'needs-color' | 'searching' | 'tracking'
export interface BatonStatus {
  state: BatonState
  confidence: number
  /** Advice after picking a colour, if it is a poor choice. */
  warning: string | null
  /** Share of the picture that matches the colour right now (high = the colour is not distinctive here). */
  matchPercent: number | null
  /** The next click on the camera preview picks the marker colour. */
  picking: boolean
  /** Draw the pixels the tracker matched over the preview (to see what it sees). */
  showMask: boolean
}

const IDLE: BatonStatus = { state: 'off', confidence: 0, warning: null, matchPercent: null, picking: false, showMask: false }
const WORK_WIDTH = 320
const UI_MS = 120

/**
 * Owns the baton tracker and its link to the camera: reads a small copy of each camera frame, finds the marker, and keeps a
 * status the Studio can show. Runs on the main thread (the video element is here; a 320×240 read-back and colour match cost
 * about a millisecond), so it never competes with hand detection in the worker.
 */
export class BatonSession {
  readonly store: Store<BatonStatus> = createStore<BatonStatus>(IDLE)
  private tracker = new BatonTracker()
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private colorKey = ''
  private tol = -1
  private lastUi = -Infinity
  /** The tip's recent positions (display space), for drawing a trail. */
  readonly trail: { x: number; y: number; t: number }[] = []

  constructor(private getConfig: () => GestureConfig) {}

  get tracker_(): BatonTracker {
    return this.tracker
  }

  private sync(cfg: GestureConfig['baton']) {
    const key = cfg.color ? `${cfg.color.h.toFixed(1)}/${cfg.color.s.toFixed(2)}/${cfg.color.v.toFixed(2)}` : ''
    if (key !== this.colorKey) {
      this.colorKey = key
      this.tracker.setColor(cfg.color)
      this.trail.length = 0
    }
    if (cfg.tolerance !== this.tol) {
      this.tol = cfg.tolerance
      this.tracker.setTolerance(cfg.tolerance)
    }
  }

  private grab(video: HTMLVideoElement): Pixels | null {
    if (video.videoWidth < 2 || video.videoHeight < 2) return null
    const w = WORK_WIDTH
    const h = Math.max(2, Math.round((WORK_WIDTH * video.videoHeight) / video.videoWidth))
    if (!this.canvas) {
      this.canvas = document.createElement('canvas')
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    }
    if (!this.ctx) return null
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.ctx.drawImage(video, 0, 0, w, h)
    return this.ctx.getImageData(0, 0, w, h)
  }

  /** Called once per camera frame. Returns the tip when it is found. */
  process(video: HTMLVideoElement | null, tMs: number): BatonSample | null {
    const cfg = this.getConfig().baton
    if (!cfg.enabled) {
      if (this.store.get().state !== 'off') this.store.set((p) => ({ ...IDLE, showMask: p.showMask }))
      return null
    }
    this.sync(cfg)
    if (!cfg.color) {
      this.setStatus({ state: 'needs-color', confidence: 0 }, tMs, true)
      return null
    }
    const px = video ? this.grab(video) : null
    if (!px) return null
    const s = this.tracker.track(px, tMs)
    if (s) {
      this.trail.push({ x: s.x, y: s.y, t: tMs })
      while (this.trail.length && tMs - this.trail[0].t > 450) this.trail.shift()
    }
    const due = tMs - this.lastUi >= UI_MS
    this.setStatus({ state: s ? 'tracking' : 'searching', confidence: s?.confidence ?? 0, ...(due && cfg.color ? { matchPercent: Math.round(100 * matchFraction(px, cfg.color, cfg.tolerance)) } : {}) }, tMs)
    return s
  }

  private setStatus(p: Partial<BatonStatus>, tMs: number, force = false) {
    if (!force && tMs - this.lastUi < UI_MS && this.store.get().state === (p.state ?? this.store.get().state)) return
    this.lastUi = tMs
    this.store.set((prev) => ({ ...prev, ...p }))
  }

  /**
   * The user clicked the marker in the (mirrored) preview. `xDisplay`, `yDisplay` are fractions of the preview; the pixel is
   * read from the un-mirrored camera frame. Saves the colour in the settings and returns advice if it is a poor choice.
   */
  pickAt(video: HTMLVideoElement, xDisplay: number, yDisplay: number): PickResult {
    const px = this.grab(video)
    if (!px) return { color: null, warning: 'The camera is not ready yet.' }
    const res = pickColor(px, 1 - xDisplay, yDisplay)
    if (res.color) this.commit(res.color)
    const frac = res.color ? matchFraction(px, res.color, gestureSettings.get().baton.tolerance) : 0
    const crowded = frac > 0.02 ? `${Math.round(frac * 100)}% of the picture has this colour, so it is not distinctive here — choose a more vivid marker or lower the tolerance.` : null
    const warning = res.warning ?? crowded
    this.store.set((p) => ({ ...p, warning, picking: res.color ? false : p.picking }))
    return { color: res.color, warning }
  }

  private commit(color: BatonColor) {
    const cfg = gestureSettings.get()
    gestureSettings.set({ ...cfg, baton: { ...cfg.baton, color, enabled: true } })
  }

  clearColor() {
    const cfg = gestureSettings.get()
    gestureSettings.set({ ...cfg, baton: { ...cfg.baton, color: null } })
    this.store.set((p) => ({ ...p, warning: null }))
  }

  /** The demonstration conductor holds a synthetic baton: report it like a tracked tip (no camera pixels are involved). */
  synthetic(active: boolean, tMs: number) {
    if (!this.getConfig().baton.enabled) return
    this.setStatus({ state: active ? 'tracking' : 'searching', confidence: active ? 0.95 : 0 }, tMs)
  }

  setPicking(on: boolean) {
    this.store.set((p) => ({ ...p, picking: on, warning: on ? null : p.warning }))
  }
  setShowMask(on: boolean) {
    this.store.set((p) => ({ ...p, showMask: on }))
  }

  reset() {
    this.tracker.reset()
    this.trail.length = 0
    this.store.set((p) => ({ ...IDLE, showMask: p.showMask }))
  }
}
