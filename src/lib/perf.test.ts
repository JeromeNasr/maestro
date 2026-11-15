import { looksLowEnd, resolvePerf, watchFramePacing } from './perf'

describe('device class', () => {
  it('few cores or little memory is low-end; unknown values are never assumed weak', () => {
    expect(looksLowEnd({ hardwareConcurrency: 2 })).toBe(true)
    expect(looksLowEnd({ deviceMemory: 2 })).toBe(true)
    expect(looksLowEnd({ hardwareConcurrency: 4, deviceMemory: 4 })).toBe(true)
    expect(looksLowEnd({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false)
    expect(looksLowEnd({ hardwareConcurrency: 4 })).toBe(false) // memory unknown (Firefox, Safari): not enough to say
    expect(looksLowEnd({})).toBe(false)
    expect(looksLowEnd(undefined)).toBe(false)
  })
  it('an explicit choice always wins; auto follows the device and the measured downgrade', () => {
    expect(resolvePerf('full', true, true)).toBe('full')
    expect(resolvePerf('lite', false, false)).toBe('lite')
    expect(resolvePerf('auto', false, false)).toBe('full')
    expect(resolvePerf('auto', false, true)).toBe('lite')
    expect(resolvePerf('auto', true, false)).toBe('lite')
  })
})

describe('frame pacing watch', () => {
  const run = (frameMs: number, seconds: number, opts = {}) => {
    let t = 0
    const h: { cb: FrameRequestCallback | null } = { cb: null }
    let slow = 0
    watchFramePacing(() => slow++, { now: () => t, raf: (cb) => ((h.cb = cb), 1), caf: () => undefined, ...opts })
    for (let i = 0; i < (seconds * 1000) / frameMs; i++) {
      t += frameMs
      const cb = h.cb
      h.cb = null
      cb?.(t)
    }
    return slow
  }
  it('a page that keeps missing its frames is reported once, after several seconds', () => {
    expect(run(50, 12)).toBe(1)
  })
  it('a healthy 60 fps page is never reported', () => {
    expect(run(16.7, 30)).toBe(0)
  })
  it('a short stutter is not enough', () => {
    let t = 0
    const h: { cb: FrameRequestCallback | null } = { cb: null }
    let slow = 0
    watchFramePacing(() => slow++, { now: () => t, raf: (cb) => ((h.cb = cb), 1), caf: () => undefined })
    for (let i = 0; i < 1800; i++) {
      t += i > 300 && i < 360 ? 60 : 16.7 // ~3 s of slow frames in 30 s
      const cb = h.cb
      h.cb = null
      cb?.(t)
    }
    expect(slow).toBe(0)
  })
})
