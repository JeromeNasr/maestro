import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { EMPTY_TRACKING, trackedHand } from '@/test/fixtures'
import type { HandFrame, TrackedHand } from '@/vision/types'
import { CueDetector, isOpenPalm, type TransportHint } from './cueDetector'
import { makeHandLandmarks } from '@/vision/demoSource'

const CUES = DEFAULT_GESTURE_CONFIG.cues
const DYN = DEFAULT_GESTURE_CONFIG.dynamics
const RANGES = { left: null, right: null }
const HIGH = 0.3 // level ≈ 0.83 (raised)
const LOW = 0.75 // level ≈ 0.08 (lowered)

const withMotion = (h: TrackedHand, speed: number): TrackedHand => ({ ...h, kinematics: { ...h.kinematics, speed } })
function frame(t: number, l: TrackedHand | null, r: TrackedHand | null): HandFrame {
  return { timestampMs: t, source: 'camera', left: l, right: r, detections: [], tracking: EMPTY_TRACKING }
}
const pose = (y: number, t: number, o: { speed?: number; conf?: number; status?: 'tracking' | 'holding' } = {}) =>
  frame(
    t,
    withMotion({ ...trackedHand('left', 0.25, y, o.status ?? 'tracking'), confidence: o.conf ?? 0.95 }, o.speed ?? 0),
    withMotion({ ...trackedHand('right', 0.75, y, o.status ?? 'tracking'), confidence: o.conf ?? 0.95 }, o.speed ?? 0),
  )

/** Hold a pose from `from` for `ms`; returns every cue fired. */
function holdPose(d: CueDetector, transport: TransportHint, y: number, from: number, ms: number, cfg = CUES, o: Parameters<typeof pose>[2] = {}) {
  const fired: string[] = []
  for (let t = from; t <= from + ms; t += 33) {
    const r = d.update(pose(y, t, o), transport, cfg, DYN, RANGES)
    if (r.cue) fired.push(r.cue.kind)
  }
  return fired
}

describe('CueDetector', () => {
  it('both hands raised and held starts a stopped piece — after the hold time, not before', () => {
    const d = new CueDetector()
    expect(holdPose(d, 'stopped', HIGH, 0, CUES.startHoldMs - 100)).toEqual([])
    const d2 = new CueDetector()
    expect(holdPose(d2, 'stopped', HIGH, 0, CUES.startHoldMs + 100)).toEqual(['start'])
  })

  it('the same pose pauses a playing piece and resumes a paused one', () => {
    expect(holdPose(new CueDetector(), 'playing', HIGH, 0, CUES.pauseHoldMs + 100)).toEqual(['pause'])
    expect(holdPose(new CueDetector(), 'paused', HIGH, 0, CUES.pauseHoldMs + 100)).toEqual(['resume'])
  })

  it('both hands lowered and held stops a playing or paused piece, but does nothing when already stopped', () => {
    expect(holdPose(new CueDetector(), 'playing', LOW, 0, CUES.stopHoldMs + 100)).toEqual(['stop'])
    expect(holdPose(new CueDetector(), 'paused', LOW, 0, CUES.stopHoldMs + 100)).toEqual(['stop'])
    expect(holdPose(new CueDetector(), 'stopped', LOW, 0, CUES.stopHoldMs + 500)).toEqual([])
  })

  it('stop and pause stay available DURING playback (cues are not suppressed while conducting)', () => {
    const d = new CueDetector()
    expect(holdPose(d, 'playing', LOW, 0, 2000)).toContain('stop')
    expect(holdPose(new CueDetector(), 'playing', HIGH, 0, 2000)).toContain('pause')
  })

  it('requires BOTH hands to be still: a moving right hand (conducting) never triggers a cue', () => {
    const d = new CueDetector()
    const fired: string[] = []
    for (let t = 0; t <= 10000; t += 33) {
      const f = frame(t, withMotion(trackedHand('left', 0.25, LOW), 0), withMotion(trackedHand('right', 0.75, LOW), 3.0))
      const r = d.update(f, 'playing', CUES, DYN, RANGES)
      if (r.cue) fired.push(r.cue.kind)
    }
    expect(fired).toEqual([])
  })

  it('low tracking confidence blocks cues', () => {
    expect(holdPose(new CueDetector(), 'stopped', HIGH, 0, 3000, CUES, { conf: 0.4 })).toEqual([])
  })

  it('a stale "holding" pose cannot trigger a cue', () => {
    expect(holdPose(new CueDetector(), 'stopped', HIGH, 0, 3000, CUES, { status: 'holding' })).toEqual([])
  })

  it('needs both hands present', () => {
    const d = new CueDetector()
    const fired: string[] = []
    for (let t = 0; t <= 3000; t += 33) {
      if (d.update(frame(t, null, withMotion(trackedHand('right', 0.75, HIGH), 0)), 'stopped', CUES, DYN, RANGES).cue) fired.push('x')
    }
    expect(fired).toEqual([])
  })

  it('an interrupted hold restarts the clock', () => {
    const d = new CueDetector()
    const fired: string[] = []
    const run = (y: number, from: number, ms: number) => {
      for (let t = from; t <= from + ms; t += 33) if (d.update(pose(y, t), 'stopped', CUES, DYN, RANGES).cue) fired.push('start')
    }
    run(HIGH, 0, CUES.startHoldMs - 150)
    run(0.5, 700, 200) // lowered halfway: not raised any more
    run(HIGH, 900, CUES.startHoldMs - 150)
    expect(fired).toEqual([])
  })

  it('fires once per hold (latch) and re-arms after the pose is released', () => {
    const d = new CueDetector()
    expect(holdPose(d, 'stopped', HIGH, 0, 5000)).toEqual(['start'])
    holdPose(d, 'stopped', 0.5, 5100, 300) // release
    expect(holdPose(d, 'stopped', HIGH, 5500, CUES.startHoldMs + 100)).toEqual(['start'])
  })

  it('reports hold progress for the UI', () => {
    const d = new CueDetector()
    let last = d.update(pose(HIGH, 0), 'stopped', CUES, DYN, RANGES)
    expect(last.progress.cue).toBe('start')
    for (let t = 33; t <= CUES.startHoldMs / 2; t += 33) last = d.update(pose(HIGH, t), 'stopped', CUES, DYN, RANGES)
    expect(last.progress.progress).toBeGreaterThan(0.4)
    expect(last.progress.progress).toBeLessThan(0.7)
    last = d.update(pose(0.5, 2000), 'stopped', CUES, DYN, RANGES)
    expect(last.progress).toEqual({ cue: null, progress: 0 })
  })

  it('each cue can be disabled in settings', () => {
    expect(holdPose(new CueDetector(), 'stopped', HIGH, 0, 2000, { ...CUES, startCueEnabled: false })).toEqual([])
    expect(holdPose(new CueDetector(), 'playing', LOW, 0, 3000, { ...CUES, stopCueEnabled: false })).toEqual([])
    expect(holdPose(new CueDetector(), 'playing', HIGH, 0, 3000, { ...CUES, pauseCueEnabled: false })).toEqual([])
  })

  it('uses the calibrated range for "raised"', () => {
    // with a calibrated range 0.55–0.7, y=0.6 is a mid-height hand (level 0.67 < 0.72)
    const d = new CueDetector()
    const r = { left: { highY: 0.55, lowY: 0.7 }, right: { highY: 0.55, lowY: 0.7 } }
    const fired: string[] = []
    for (let t = 0; t <= 3000; t += 33) if (d.update(pose(0.6, t), 'stopped', CUES, DYN, r).cue) fired.push('s')
    expect(fired).toEqual([])
    for (let t = 3000; t <= 5000; t += 33) if (d.update(pose(0.56, t), 'stopped', CUES, DYN, r).cue) fired.push('s')
    expect(fired).toEqual(['s'])
  })

  describe('open palm pause (opt-in)', () => {
    const openHand = (): TrackedHand => ({ ...trackedHand('right', 0.75, 0.5), landmarks: makeHandLandmarks(0.75, 0.5, 0.16, 'right') })
    const fist = (): TrackedHand => {
      const lm = makeHandLandmarks(0.75, 0.5, 0.16, 'right')
      const w = lm[0]
      // curl all four fingertips back toward the wrist
      const curled = lm.map((p, i) => ([8, 12, 16, 20].includes(i) ? { ...p, x: w.x + (p.x - w.x) * 0.3, y: w.y + (p.y - w.y) * 0.3 } : p))
      return { ...trackedHand('right', 0.75, 0.5), landmarks: curled }
    }
    const run = (h: TrackedHand, cfg: typeof CUES, transport: TransportHint = 'playing') => {
      const d = new CueDetector()
      const fired: string[] = []
      for (let t = 0; t <= 2500; t += 33) {
        const r = d.update(frame(t, null, h), transport, cfg, DYN, RANGES)
        if (r.cue) fired.push(`${r.cue.kind}:${r.cue.source}`)
      }
      return fired
    }
    it('is OFF by default', () => expect(run(openHand(), CUES)).toEqual([]))
    it('pauses / resumes when enabled', () => {
      const on = { ...CUES, openPalmPauseEnabled: true }
      expect(run(openHand(), on)).toEqual(['pause:open-palm'])
      expect(run(openHand(), on, 'paused')).toEqual(['resume:open-palm'])
    })
    it('a closed fist is not an open palm', () => {
      expect(isOpenPalm(openHand().landmarks)).toBe(true)
      expect(isOpenPalm(fist().landmarks)).toBe(false)
      expect(run(fist(), { ...CUES, openPalmPauseEnabled: true })).toEqual([])
    })
  })
})
