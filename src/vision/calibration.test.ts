import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { frame, trackedHand } from '@/test/fixtures'
import { CalibrationSession } from './calibration'
import type { ReportedLabel } from './types'

const CFG = DEFAULT_GESTURE_CONFIG.calibration
const N = CFG.samplesPerHand

function feed(c: CalibrationSession, t: { now: number }, n: number, f: () => ReturnType<typeof frame>) {
  for (let i = 0; i < n; i++) {
    t.now += 33
    c.update(f(), t.now)
  }
}
const one = (label: ReportedLabel, x: number) => () => frame({ detections: [{ label, x }] })

/** Runs both handedness steps. `rightLabel`/`leftLabel` = what the detector reports for the user's right/left hand. */
function handednessSteps(c: CalibrationSession, t: { now: number }, rightLabel: ReportedLabel, leftLabel: ReportedLabel) {
  feed(c, t, N, one(rightLabel, 0.75))
  feed(c, t, N, one(leftLabel, 0.25))
}

function rangeFrames(c: CalibrationSession, t: { now: number }, opts: { left?: boolean; right?: boolean; amplitude?: number } = {}) {
  const { left = true, right = true, amplitude = 0.3 } = opts
  const end = t.now + CFG.rangeDurationMs + 100
  let i = 0
  while (t.now < end) {
    t.now += 33
    const w = Math.sin(i++ / 8)
    c.update(frame({ left: left ? trackedHand('left', 0.25 + w * amplitude, 0.5 + w * amplitude) : null, right: right ? trackedHand('right', 0.75 + w * amplitude, 0.5 - w * amplitude) : null }), t.now)
  }
}

describe('CalibrationSession — handedness validation against the mirrored preview', () => {
  it('starts on the right-hand step', () => {
    const c = new CalibrationSession(CFG)
    c.start(0)
    expect(c.state.step).toBe('handedness-right')
    expect(c.active).toBe(true)
    expect(c.state.instruction).toMatch(/right side of the preview/i)
  })

  it('concludes "no swap" when the detector labels match the hands', () => {
    const c = new CalibrationSession(CFG)
    const t = { now: 0 }
    c.start(0)
    handednessSteps(c, t, 'Right', 'Left')
    expect(c.state.step).toBe('range')
    expect(c.provisionalSwap).toBe(false)
    rangeFrames(c, t)
    expect(c.state.step).toBe('complete')
    expect(c.state.profile!.handedness).toMatchObject({ swap: false, observed: { right: 'Right', left: 'Left' } })
  })

  it('concludes "swap" when the detector labels are reversed', () => {
    const c = new CalibrationSession(CFG)
    const t = { now: 0 }
    c.start(0)
    handednessSteps(c, t, 'Left', 'Right')
    expect(c.provisionalSwap).toBe(true) // available immediately so the pipeline can apply it during the range step
    rangeFrames(c, t)
    expect(c.state.profile!.handedness.swap).toBe(true)
  })

  it('fails (rather than guessing) when both hands receive the same label', () => {
    const c = new CalibrationSession(CFG)
    const t = { now: 0 }
    c.start(0)
    handednessSteps(c, t, 'Right', 'Right')
    expect(c.state.step).toBe('failed')
    expect(c.state.failure).toMatch(/same label/i)
    expect(c.provisionalSwap).toBeNull()
  })

  it('fails when the label keeps flipping for one hand', () => {
    const c = new CalibrationSession(CFG)
    const t = { now: 0 }
    c.start(0)
    let i = 0
    feed(c, t, N, () => frame({ detections: [{ label: i++ % 2 ? 'Left' : 'Right', x: 0.75 }] }))
    expect(c.state.step).toBe('failed')
    expect(c.state.failure).toMatch(/kept flipping/i)
  })

  it('does not collect samples when the hand is on the wrong side of the preview', () => {
    const c = new CalibrationSession(CFG)
    const t = { now: 0 }
    c.start(0)
    feed(c, t, 10, one('Right', 0.3))
    expect(c.state.progress).toBe(0)
    expect(c.state.hint).toMatch(/right side of the preview/i)
    feed(c, t, 10, one('Right', 0.5)) // centre line is not "right" either
    expect(c.state.progress).toBe(0)
  })

  it('asks the user to show only one hand', () => {
    const c = new CalibrationSession(CFG)
    c.start(0)
    c.update(frame({ detections: [{ label: 'Right', x: 0.75 }, { label: 'Left', x: 0.25 }] }), 33)
    expect(c.state.progress).toBe(0)
    expect(c.state.hint).toMatch(/only your right hand/i)
  })

  it('prompts when no hand is visible', () => {
    const c = new CalibrationSession(CFG)
    c.start(0)
    c.update(frame({}), 33)
    expect(c.state.hint).toMatch(/no hand detected/i)
  })

  it('reports step progress', () => {
    const c = new CalibrationSession(CFG)
    const t = { now: 0 }
    c.start(0)
    feed(c, t, N / 2, one('Right', 0.75))
    expect(c.state.progress).toBeCloseTo(0.5)
  })

  it('times out a stuck step', () => {
    const c = new CalibrationSession(CFG)
    c.start(0)
    c.update(frame({}), CFG.stepTimeoutMs + 1)
    expect(c.state.step).toBe('failed')
    expect(c.state.failure).toMatch(/timed out/i)
  })

  it('can be cancelled and restarted', () => {
    const c = new CalibrationSession(CFG)
    c.start(0)
    c.cancel()
    expect(c.state.step).toBe('idle')
    expect(c.active).toBe(false)
    c.start(100)
    expect(c.state.step).toBe('handedness-right')
  })
})

describe('CalibrationSession — range capture', () => {
  const toRange = () => {
    const c = new CalibrationSession(CFG)
    const t = { now: 0 }
    c.start(0)
    handednessSteps(c, t, 'Right', 'Left')
    return { c, t }
  }

  it('records ranges for both hands', () => {
    const { c, t } = toRange()
    rangeFrames(c, t)
    const p = c.state.profile!
    expect(p.ranges.left!.maxY - p.ranges.left!.minY).toBeGreaterThan(CFG.minRangeSpan)
    expect(p.ranges.right!.handSize).toBeCloseTo(0.16, 1)
    expect(p.warnings).toEqual([])
  })

  it('accepts one hand but warns about the other', () => {
    const { c, t } = toRange()
    rangeFrames(c, t, { left: false })
    expect(c.state.step).toBe('complete')
    expect(c.state.profile!.ranges.left).toBeNull()
    expect(c.state.profile!.warnings.join(' ')).toMatch(/left hand range was not captured/i)
  })

  it('rejects a hand that barely moved', () => {
    const { c, t } = toRange()
    rangeFrames(c, t, { amplitude: 0.01 })
    expect(c.state.step).toBe('failed')
    expect(c.state.failure).toMatch(/barely moved/i)
  })

  it('fails when no hands are seen at all', () => {
    const { c, t } = toRange()
    rangeFrames(c, t, { left: false, right: false })
    expect(c.state.step).toBe('failed')
  })

  it('ignores "holding" (stale) hands when sampling', () => {
    const { c, t } = toRange()
    const end = t.now + CFG.rangeDurationMs + 100
    while (t.now < end) {
      t.now += 33
      c.update(frame({ left: trackedHand('left', 0.2, 0.4, 'holding'), right: trackedHand('right', 0.8, 0.5, 'holding') }), t.now)
    }
    expect(c.state.step).toBe('failed')
  })

  it('uses robust percentiles so a single outlier does not stretch the range', () => {
    const { c, t } = toRange()
    const end = t.now + CFG.rangeDurationMs + 100
    let i = 0
    while (t.now < end) {
      t.now += 33
      const y = i++ === 20 ? 0.99 : 0.4 + 0.2 * Math.sin(i / 6)
      c.update(frame({ right: trackedHand('right', 0.75, y) }), t.now)
    }
    expect(c.state.profile!.ranges.right!.maxY).toBeLessThan(0.7)
  })
})
