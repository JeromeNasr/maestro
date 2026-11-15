import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { simulate } from '@/test/conductorSim'
import { DemoSource, makeHandLandmarks } from '@/vision/demoSource'
import { readFingerPose } from './fingerPose'
import type { MixerEvent } from './types'

const cfg = DEFAULT_GESTURE_CONFIG.mixer
const mixerEvents = (r: ReturnType<typeof simulate>) => r.events.filter((e): e is MixerEvent => e.type === 'mixer')

describe('readFingerPose', () => {
  it.each([0, 1, 2, 3, 4])('counts %i extended fingers with the thumb tucked', (n) => {
    const p = readFingerPose(makeHandLandmarks(0.3, 0.5, 0.16, 'left', 4 / 3, n), 4 / 3, cfg)!
    expect(p.count).toBe(n)
    expect(p.thumbTucked).toBe(true)
    expect(p.extended.map(Boolean)).toEqual([0, 1, 2, 3].map((i) => i < n))
  })
  it('a natural open hand has all four fingers up but the thumb OUT, so it is not the mixer pose', () => {
    const p = readFingerPose(makeHandLandmarks(0.3, 0.5, 0.16, 'left', 4 / 3), 4 / 3, cfg)!
    expect(p.count).toBe(4)
    expect(p.thumbTucked).toBe(false)
  })
  it('works at any hand size and for either hand', () => {
    for (const size of [0.06, 0.1, 0.25]) for (const side of ['left', 'right'] as const) expect(readFingerPose(makeHandLandmarks(0.5, 0.5, size, side, 4 / 3, 2), 4 / 3, cfg)!.count).toBe(2)
  })
  it('rejects malformed input', () => {
    expect(readFingerPose([], 1, cfg)).toBeNull()
  })
})

describe('finger mixer (through the real vision pipeline)', () => {
  // Left hand: natural until 2 s; 3 fingers (brass) 2–9 s at mid height, then low (off) from 5 s; fist 9–10 s; natural afterwards.
  const level = (t: number) => (t < 5 ? 0.55 : 0.08)
  const pose = (t: number) => (t < 2 ? -1 : t < 9 ? 3 : t < 10.2 ? 0 : -1)
  const run = (extra: object = {}, seconds = 16) => simulate({ demo: { bpm: 90, leftLevel: level, leftPose: pose, noise: 0.002, ...extra }, seconds })

  it('3 fingers held still grabs the BRASS after the hold, and not before', () => {
    const grabs = mixerEvents(run()).filter((e) => e.phase === 'grab')
    expect(grabs).toHaveLength(1)
    expect(grabs[0].section).toBe('brass')
    expect(grabs[0].timestampMs).toBeGreaterThan(2000 + cfg.holdMs - 100)
    expect(grabs[0].timestampMs).toBeLessThan(2000 + cfg.holdMs + 600)
  })
  it('1, 2, 3 and 4 fingers pick strings, woodwinds, brass and percussion', () => {
    for (const [n, section] of [[1, 'strings'], [2, 'woodwinds'], [3, 'brass'], [4, 'percussion']] as const) {
      const r = simulate({ demo: { bpm: 90, leftLevel: 0.5, leftPose: (t: number) => (t < 1 ? -1 : n) }, seconds: 5 })
      expect(mixerEvents(r).find((e) => e.phase === 'grab')?.section, `${n} fingers`).toBe(section)
    }
  })
  it('while held, the hand height is the volume: low = off, and it only starts after the hand has moved', () => {
    const lv = mixerEvents(run()).filter((e) => e.phase === 'level')
    expect(lv.length).toBeGreaterThan(3)
    expect(lv.every((e) => e.section === 'brass')).toBe(true)
    expect(lv.at(-1)!.volume).toBeLessThan(0.05) // hand at the bottom = off
    // nothing is emitted before the hand moves (grab at mid height, hand still): no sudden jump on grab
    const firstLevelT = lv[0].timestampMs
    expect(firstLevelT).toBeGreaterThan(4800)
  })
  it('a hand raised to the top sets full volume', () => {
    const r = simulate({ demo: { bpm: 90, leftLevel: (t: number) => (t < 4 ? 0.3 : 0.97), leftPose: (t: number) => (t < 1 ? -1 : 2) }, seconds: 9 })
    expect(mixerEvents(r).filter((e) => e.phase === 'level').at(-1)!.volume).toBeGreaterThan(0.95)
  })
  it('a fist lets go, after which the volume no longer follows the hand', () => {
    const ev = mixerEvents(run())
    const rel = ev.find((e) => e.phase === 'release')!
    expect(rel.section).toBe('brass')
    expect(rel.timestampMs).toBeGreaterThan(9000 + cfg.releaseMs - 100)
    expect(rel.timestampMs).toBeLessThan(9000 + cfg.releaseMs + 600)
    expect(ev.filter((e) => e.phase === 'level' && e.timestampMs > rel.timestampMs)).toHaveLength(0)
  })
  it('ordinary dynamics are paused while a section is held, and come back after', () => {
    const r = run()
    const snaps = r.snapshots
    const during = snaps.filter((_, i) => r.frames[i].timestampMs > 4000 && r.frames[i].timestampMs < 8500).map((s) => s.dynamics)
    expect(during.every((d) => d.source === 'hold' || d.source === 'hand')).toBe(true)
    // the hand dropped to the bottom (level 0.08 → "pp") but the conducting dynamics did NOT follow it while the mixer held the hand
    expect(Math.max(...during.map((d) => d.level))).toBeGreaterThan(0.3)
    expect(r.snapshots.at(-1)!.dynamics.level).toBeLessThan(0.2) // after release the hand (still low) is the dynamics hand again
  })
  it('a natural open hand (thumb out), however long it is held, never grabs anything', () => {
    const r = simulate({ demo: { bpm: 90, leftLevel: 0.5 }, seconds: 20 })
    expect(mixerEvents(r)).toHaveLength(0)
  })
  it('a pose that is not held still (moving hand) does not grab', () => {
    const r = simulate({ demo: { bpm: 90, leftLevel: (t: number) => 0.5 + 0.4 * Math.sin(t * 5), leftPose: 2 }, seconds: 10 })
    expect(mixerEvents(r).filter((e) => e.phase === 'grab')).toHaveLength(0)
  })
  it('a pose held while the right hand conducts never fires the two-hands start/stop cues', () => {
    const r = simulate({ demo: { bpm: 90, leftLevel: 0.85, leftPose: 2 }, seconds: 10, transport: 'stopped' })
    expect(r.events.filter((e) => e.type === 'cue')).toHaveLength(0)
  })
  it('switching: a different finger count switches to that section', () => {
    const r = simulate({ demo: { bpm: 90, leftLevel: 0.5, leftPose: (t: number) => (t < 1 ? -1 : t < 5 ? 1 : 4) }, seconds: 9 })
    const ev = mixerEvents(r)
    expect(ev.filter((e) => e.phase === 'grab').map((e) => e.section)).toEqual(['strings', 'percussion'])
    expect(ev.filter((e) => e.phase === 'release').map((e) => e.section)).toEqual(['strings'])
  })
  it('losing the hand for over a second lets go; it can be switched off in the settings', () => {
    const r = simulate({ demo: { bpm: 90, leftLevel: 0.5, leftPose: (t: number) => (t < 1 ? -1 : 2), visible: (s, t) => s === 'right' || t < 4 || t > 9 }, seconds: 10 })
    expect(mixerEvents(r).some((e) => e.phase === 'release')).toBe(true)
    const off = simulate({ demo: { bpm: 90, leftLevel: 0.5, leftPose: 2 }, seconds: 6, config: { mixer: { ...cfg, enabled: false } } })
    expect(mixerEvents(off)).toHaveLength(0)
  })
  void DemoSource
})
