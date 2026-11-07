import { COMPOSITIONS, formatDuration, getComposition, searchCompositions } from './compositions'
import { selectComposition, selectedCompositionId } from './selection'

describe('composition registry', () => {
  it('has unique ids', () => {
    expect(new Set(COMPOSITIONS.map((c) => c.id)).size).toBe(COMPOSITIONS.length)
  })

  it('only marks a piece available if it has a MIDI path and a licence record', () => {
    for (const c of COMPOSITIONS.filter((c) => c.status === 'available')) {
      expect(c.midiUrl, c.id).toBeTruthy()
      expect(c.midiLicense?.license, c.id).toBeTruthy()
      expect(c.midiLicense?.source, c.id).toBeTruthy()
    }
  })

  it('explains why each planned piece is unavailable', () => {
    for (const c of COMPOSITIONS.filter((c) => c.status === 'planned')) expect(c.pendingReason, c.id).toBeTruthy()
  })

  it('lists the three intended classical pieces as planned, not available', () => {
    for (const id of ['bach-brandenburg-3', 'vivaldi-spring', 'handel-water-music']) {
      expect(getComposition(id)?.status).toBe('planned')
    }
  })
})

describe('searchCompositions', () => {
  it('returns everything for an empty query', () => {
    expect(searchCompositions('  ')).toHaveLength(COMPOSITIONS.length)
  })
  it('matches composer, case-insensitively', () => {
    expect(searchCompositions('vIvAlDi').map((c) => c.id)).toEqual(['vivaldi-spring'])
  })
  it('matches time signature', () => {
    expect(searchCompositions('3/4').map((c) => c.id)).toEqual(['handel-water-music'])
  })
  it('returns nothing for a non-match', () => {
    expect(searchCompositions('zzz')).toEqual([])
  })
})

describe('selection', () => {
  it('selects available compositions', () => {
    expect(selectComposition('maestro-demo-001')).toBe(true)
    expect(selectedCompositionId.get()).toBe('maestro-demo-001')
  })
  it('refuses planned and unknown compositions', () => {
    expect(selectComposition('vivaldi-spring')).toBe(false)
    expect(selectComposition('nope')).toBe(false)
    expect(selectedCompositionId.get()).toBe('maestro-demo-001')
  })
})

describe('formatDuration', () => {
  it('formats mm:ss and a dash for unknown', () => {
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(0)).toBe('—')
  })
})
