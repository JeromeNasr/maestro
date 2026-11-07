import { directionName, expectedStrokes, type V2 } from './directions'
import { PatternTracker } from './patternTracker'

const P = { tolerance: 0.5, downbeatResyncCos: 0.8, allowSkip: true }
const strokes = (ts: '2/4' | '3/4' | '4/4') => expectedStrokes(ts)
const DOWN: V2 = { x: 0, y: 1 }
const UP: V2 = { x: 0, y: -1 }
const LEFT: V2 = { x: -1, y: 0 }
const RIGHT: V2 = { x: 1, y: 0 }

describe('PatternTracker', () => {
  it('waits for a downbeat first', () => {
    const t = new PatternTracker('4/4', P)
    expect(t.expectedBeat).toBeNull()
    expect(t.decide(RIGHT)).toEqual({ accepted: false, reason: 'awaiting-downbeat' })
    const d = t.decide(DOWN)
    expect(d).toMatchObject({ accepted: true, beatIndex: 0, skipped: 0, resynced: false })
    expect(t.expectedBeat).toBe(2)
  })

  it.each(['2/4', '3/4', '4/4'] as const)('follows a full %s bar and wraps', (ts) => {
    const t = new PatternTracker(ts, P)
    const e = strokes(ts)
    const seq: number[] = []
    for (let bar = 0; bar < 3; bar++) for (const v of e) {
      const d = t.decide(v)
      expect(d.accepted).toBe(true)
      if (d.accepted) seq.push(d.beatIndex + 1)
    }
    expect(seq).toEqual(Array.from({ length: 3 * e.length }, (_, i) => (i % e.length) + 1))
  })

  it('uses state to tell 4/4 beat 2 from beat 4 even though both travel up-left', () => {
    const e = strokes('4/4')
    expect(directionName(e[1])).toBe(directionName(e[3]))
    const t = new PatternTracker('4/4', P)
    t.decide(e[0])
    const d2 = t.decide(e[1])
    expect(d2).toMatchObject({ accepted: true, beatIndex: 1 })
  })

  it('tolerates direction error up to the tolerance and rejects beyond it', () => {
    const rotatedUp = (deg: number): V2 => {
      const a = ((-90 + deg) * Math.PI) / 180
      return { x: Math.cos(a), y: Math.sin(a) }
    }
    const t = new PatternTracker('2/4', P)
    t.decide(DOWN)
    expect(t.decide(rotatedUp(40)).accepted).toBe(true) // 40° off the expected "up"
    const t2 = new PatternTracker('2/4', P)
    t2.decide(DOWN)
    expect(t2.decide(rotatedUp(75))).toEqual({ accepted: false, reason: 'off-pattern' }) // beyond ±60°
  })

  it('a stroke that fits a LATER beat is taken as that beat with the one between inferred missed (4/4)', () => {
    const t = new PatternTracker('4/4', P)
    t.decide(DOWN)
    expect(t.decide({ x: 1, y: 0.2 })).toMatchObject({ accepted: true, beatIndex: 2, skipped: 1 })
  })

  it('infers a single missed beat from the next stroke direction', () => {
    const e = strokes('4/4')
    const t = new PatternTracker('4/4', P)
    t.decide(e[0])
    // beat 2 (left) missed: next stroke is beat 3 (right)
    const d = t.decide(e[2])
    expect(d).toMatchObject({ accepted: true, beatIndex: 2, skipped: 1 })
  })

  it('does not infer a skip when skipping is disabled', () => {
    const e = strokes('4/4')
    const t = new PatternTracker('4/4', { ...P, allowSkip: false })
    t.decide(e[0])
    expect(t.decide(e[2])).toEqual({ accepted: false, reason: 'off-pattern' })
  })

  it('resynchronises on a strong downbeat when mid-bar', () => {
    const e = strokes('4/4')
    const t = new PatternTracker('4/4', P)
    t.decide(e[0])
    t.decide(e[1])
    const d = t.decide(DOWN) // expected beat 3 but a clear downbeat arrives
    expect(d).toMatchObject({ accepted: true, beatIndex: 0, resynced: true })
    expect(t.expectedBeat).toBe(2)
  })

  it('rejects strokes that fit nothing', () => {
    const t = new PatternTracker('2/4', P)
    t.decide(DOWN)
    expect(t.decide(LEFT)).toEqual({ accepted: false, reason: 'off-pattern' })
    expect(t.expectedBeat).toBe(2) // state unchanged by a rejected stroke
    expect(t.decide(UP).accepted).toBe(true)
  })

  it('switching time signature restarts at the downbeat; reset forgets position', () => {
    const t = new PatternTracker('4/4', P)
    t.decide(DOWN)
    t.setTimeSignature('3/4')
    expect(t.expectedBeat).toBeNull()
    expect(t.beats).toBe(3)
    t.decide(DOWN)
    t.reset()
    expect(t.expectedBeat).toBeNull()
  })
})
