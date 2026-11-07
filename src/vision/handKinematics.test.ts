import { HandKinematics } from './handKinematics'

describe('HandKinematics', () => {
  const run = (k: HandKinematics, f: (t: number) => { x: number; y: number }, seconds: number, fps = 30) => {
    let s = k.update(f(0), 0)
    for (let i = 1; i <= seconds * fps; i++) s = k.update(f(i / fps), (i / fps) * 1000)
    return s
  }

  it('estimates velocity and direction for movement to the right', () => {
    const s = run(new HandKinematics(), (t) => ({ x: 0.2 + 0.5 * t, y: 0.5 }), 1)
    expect(s.velocity.x).toBeCloseTo(0.5, 1)
    expect(s.velocity.y).toBeCloseTo(0, 2)
    expect(s.speed).toBeCloseTo(0.5, 1)
    expect(s.direction!).toBeCloseTo(0, 1)
  })

  it('reports downward movement as +π/2 (screen y grows downward)', () => {
    const s = run(new HandKinematics(), (t) => ({ x: 0.5, y: 0.2 + 0.6 * t }), 1)
    expect(s.direction!).toBeCloseTo(Math.PI / 2, 1)
  })

  it('reports leftward movement as ±π', () => {
    const s = run(new HandKinematics(), (t) => ({ x: 0.8 - 0.5 * t, y: 0.5 }), 1)
    expect(Math.abs(s.direction!)).toBeCloseTo(Math.PI, 1)
  })

  it('has no direction when still', () => {
    const s = run(new HandKinematics(), () => ({ x: 0.5, y: 0.5 }), 1)
    expect(s.direction).toBeNull()
    expect(s.speed).toBeCloseTo(0, 3)
  })

  it('estimates positive acceleration while speeding up', () => {
    const k = new HandKinematics()
    const s = run(k, (t) => ({ x: 0.1 + 0.5 * t * t, y: 0.5 }), 0.8)
    expect(s.acceleration.x).toBeGreaterThan(0.2)
  })

  it('restarts after a long gap instead of producing a huge velocity', () => {
    const k = new HandKinematics()
    k.update({ x: 0.1, y: 0.5 }, 0)
    k.update({ x: 0.12, y: 0.5 }, 33)
    const s = k.update({ x: 0.9, y: 0.5 }, 2000)
    expect(s.speed).toBe(0)
  })

  it('reset forgets history', () => {
    const k = new HandKinematics()
    k.update({ x: 0, y: 0 }, 0)
    k.reset()
    expect(k.update({ x: 1, y: 1 }, 33).speed).toBe(0)
  })
})
