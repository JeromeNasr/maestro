import { SECTIONS } from '@/orchestra/sections'
import { dbToGain, gainToDb, sectionBrightnessHz, sectionDb, sectionDynamicsGain, SECTION_DYNAMICS, velocityScale } from './dynamics'
import { DEFAULT_VOLUME, Mixer, volumeToGain } from './mixer'
import { midiName, midiToHz } from './pitch'

describe('pitch', () => {
  it('equal temperament: A4 = 440, octaves double, middle C', () => {
    expect(midiToHz(69)).toBeCloseTo(440)
    expect(midiToHz(81)).toBeCloseTo(880)
    expect(midiToHz(57)).toBeCloseTo(220)
    expect(midiToHz(60)).toBeCloseTo(261.626, 2)
    expect(midiName(60)).toBe('C4')
    expect(midiName(69)).toBe('A4')
  })
})

describe('dynamics mapping', () => {
  it('is monotonic: louder level → louder gain, for every section', () => {
    for (const { id } of SECTIONS) {
      let prev = -Infinity
      for (let l = 0; l <= 1.0001; l += 0.05) {
        const g = sectionDynamicsGain(id, l)
        expect(g).toBeGreaterThan(prev)
        prev = g
      }
    }
  })

  it('level 1 is the loudest (offset), level 0 is rangeDb quieter', () => {
    for (const { id } of SECTIONS) {
      const d = SECTION_DYNAMICS[id]
      expect(sectionDb(id, 1)).toBeCloseTo(d.offsetDb)
      expect(sectionDb(id, 0)).toBeCloseTo(d.offsetDb - d.rangeDb)
    }
  })

  it('sections respond differently: brass have the widest range, percussion the narrowest', () => {
    const ranges = Object.fromEntries(SECTIONS.map(({ id }) => [id, sectionDb(id, 1) - sectionDb(id, 0)]))
    expect(ranges.brass).toBeGreaterThan(ranges.strings)
    expect(ranges.strings).toBeGreaterThan(ranges.woodwinds)
    expect(ranges.woodwinds).toBeGreaterThan(ranges.percussion)
  })

  it('gets brighter as it gets louder (low-pass opens), within each section\'s range', () => {
    for (const { id } of SECTIONS) {
      const [lo, hi] = SECTION_DYNAMICS[id].brightnessHz
      expect(sectionBrightnessHz(id, 0)).toBeCloseTo(lo)
      expect(sectionBrightnessHz(id, 1)).toBeCloseTo(hi)
      expect(sectionBrightnessHz(id, 0.6)).toBeGreaterThan(sectionBrightnessHz(id, 0.3))
    }
  })

  it('clamps out-of-range and non-finite levels', () => {
    expect(sectionDb('strings', 5)).toBe(sectionDb('strings', 1))
    expect(sectionDb('strings', -3)).toBe(sectionDb('strings', 0))
    expect(Number.isFinite(sectionDb('strings', NaN))).toBe(true)
  })

  it('db/gain conversions round-trip; velocity scales 0.65 → 1', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2)
    expect(gainToDb(dbToGain(-13))).toBeCloseTo(-13)
    expect(gainToDb(0)).toBe(-Infinity)
    expect(velocityScale(0)).toBeCloseTo(0.65)
    expect(velocityScale(1)).toBeCloseTo(1)
  })
})

describe('Mixer — section volume, mute and solo', () => {
  it('starts with every section audible at the default volume', () => {
    const m = new Mixer()
    for (const { id } of SECTIONS) {
      expect(m.audible(id)).toBe(true)
      expect(m.sectionGain(id)).toBeCloseTo(volumeToGain(DEFAULT_VOLUME))
    }
  })

  it('volume controls only its own section; 0 is true silence', () => {
    const m = new Mixer()
    m.setVolume('brass', 0.3)
    expect(m.sectionGain('brass')).toBeCloseTo(0.09)
    expect(m.sectionGain('strings')).toBeCloseTo(volumeToGain(DEFAULT_VOLUME))
    m.setVolume('brass', 0)
    expect(m.sectionGain('brass')).toBe(0)
    m.setVolume('brass', 9)
    expect(m.state.sections.brass.volume).toBe(1)
  })

  it('mute silences a section without losing its volume', () => {
    const m = new Mixer()
    m.setVolume('woodwinds', 0.6)
    m.setMuted('woodwinds', true)
    expect(m.sectionGain('woodwinds')).toBe(0)
    m.setMuted('woodwinds', false)
    expect(m.sectionGain('woodwinds')).toBeCloseTo(0.36)
  })

  it('solo plays only the soloed section(s)', () => {
    const m = new Mixer()
    m.setSolo('strings', true)
    expect(m.audible('strings')).toBe(true)
    for (const id of ['woodwinds', 'brass', 'percussion'] as const) expect(m.sectionGain(id)).toBe(0)
    m.setSolo('brass', true)
    expect(m.audible('brass')).toBe(true)
    expect(m.audible('woodwinds')).toBe(false)
    m.setSolo('strings', false)
    m.setSolo('brass', false)
    for (const { id } of SECTIONS) expect(m.audible(id)).toBe(true)
  })

  it('a muted soloed section stays silent', () => {
    const m = new Mixer()
    m.setSolo('brass', true)
    m.setMuted('brass', true)
    expect(m.sectionGain('brass')).toBe(0)
    expect(m.sectionGain('strings')).toBe(0)
  })

  it('master volume is separate and reset restores defaults', () => {
    const m = new Mixer()
    m.setMaster(0.5)
    expect(m.masterGain).toBeCloseTo(0.25)
    m.setMuted('strings', true)
    m.reset()
    expect(m.masterGain).toBeCloseTo(volumeToGain(DEFAULT_VOLUME))
    expect(m.audible('strings')).toBe(true)
  })

  it('notifies subscribers on change', () => {
    const m = new Mixer()
    const cb = vi.fn()
    m.store.subscribe(cb)
    m.setMuted('brass', true)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
