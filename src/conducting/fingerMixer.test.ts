import { Mixer } from '@/audio/mixer'
import { simulate } from '@/test/conductorSim'
import { ConductorBridge } from './conductorBridge'

/** Whole chain: synthetic left hand showing fingers → real vision pipeline → gesture engine → bridge → the real Mixer. */
function drive(demo: object, seconds: number, mixer = new Mixer()) {
  const r = simulate({ demo: { bpm: 90, noise: 0.002, ...demo }, seconds })
  const bridge = new ConductorBridge(
    {
      setTargetBpm: () => undefined,
      setDynamicsLevel: () => undefined,
      setSectionVolume: (s, v) => {
        mixer.setVolume(s, v)
        if (v > 0.02 && mixer.state.sections[s].muted) mixer.setMuted(s, false)
      },
    },
    { state: () => 'playing', start: () => undefined, pause: () => undefined, resume: () => undefined, stop: () => undefined },
    { quartersPerBeat: () => 1, tempoMode: () => 'follow' },
  )
  r.snapshots.forEach((snap, i) => bridge.handle(r.events.filter((e) => e.timestampMs <= r.frames[i].timestampMs && e.timestampMs > (r.frames[i - 1]?.timestampMs ?? -1)), snap))
  return { mixer, r }
}

describe('finger mixer → real mixer', () => {
  it('2 fingers + hand to the bottom turns the WOODWINDS off, and leaves the other sections alone', () => {
    const { mixer } = drive({ leftLevel: (t: number) => (t < 4 ? 0.5 : 0.05), leftPose: (t: number) => (t < 1 ? -1 : 2) }, 9)
    expect(mixer.state.sections.woodwinds.volume).toBeLessThan(0.05)
    expect(mixer.sectionGain('woodwinds')).toBe(0)
    for (const s of ['strings', 'brass', 'percussion'] as const) expect(mixer.state.sections[s].volume).toBe(0.8)
  })
  it('raising the hand brings it back to full, and un-mutes a section that was muted on screen', () => {
    const mixer = new Mixer()
    mixer.setMuted('brass', true)
    drive({ leftLevel: (t: number) => (t < 3 ? 0.4 : 0.98), leftPose: (t: number) => (t < 1 ? -1 : 3) }, 8, mixer)
    expect(mixer.state.sections.brass.muted).toBe(false)
    expect(mixer.state.sections.brass.volume).toBeGreaterThan(0.95)
  })
  it('after a fist the section keeps the volume it was left at', () => {
    const { mixer } = drive({ leftLevel: (t: number) => (t < 3 ? 0.5 : 0.3), leftPose: (t: number) => (t < 1 ? -1 : t < 7 ? 1 : 0) }, 12)
    const v = mixer.state.sections.strings.volume
    expect(v).toBeGreaterThan(0.2)
    expect(v).toBeLessThan(0.6)
  })
  it('with the finger mixer never shown, the mixer is untouched', () => {
    const { mixer } = drive({ leftLevel: (t: number) => 0.5 + 0.4 * Math.sin(t) }, 12)
    expect(mixer.state.sections.strings.volume).toBe(0.8)
    expect(mixer.state.sections.brass.volume).toBe(0.8)
  })
})
