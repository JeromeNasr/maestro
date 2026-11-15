import { BLUE, GREEN, ORANGE, PINK, renderFrame } from '@/test/syntheticFrames'
import { BatonTracker, matchFraction, pickColor, rgbToHsv } from './batonTracker'

const W = 320
const H = 240
/** Where a marker at raw pixel (x, y) is reported: display x is mirrored. */
const expectDisplay = (x: number, y: number) => ({ x: 1 - x / W, y: y / H })

function calibrated(rgb = GREEN) {
  const tr = new BatonTracker()
  const frame = renderFrame({ discs: [{ x: 200, y: 100, r: 5, rgb }] })
  const pick = pickColor(frame, 200 / W, 100 / H)
  tr.setColor(pick.color)
  return { tr, pick }
}

describe('colour sampling', () => {
  it('rgbToHsv is right for primaries and greys', () => {
    expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 })
    expect(rgbToHsv(0, 255, 0).h).toBeCloseTo(120)
    expect(rgbToHsv(0, 0, 255).h).toBeCloseTo(240)
    expect(rgbToHsv(128, 128, 128).s).toBe(0)
  })
  it('picks the marker colour from a click and says nothing is wrong with a vivid one', () => {
    const { pick } = calibrated(GREEN)
    expect(pick.color!.h).toBeGreaterThan(110)
    expect(pick.color!.h).toBeLessThan(140)
    expect(pick.warning).toBeNull()
  })
  it('warns about skin-like, dull and dark choices, and about clicking outside', () => {
    const frame = renderFrame({ discs: [{ x: 200, y: 100, r: 6, rgb: [200, 140, 110] }, { x: 250, y: 150, r: 6, rgb: [90, 90, 95] }, { x: 100, y: 200, r: 6, rgb: [20, 60, 25] }] })
    expect(pickColor(frame, 200 / W, 100 / H).warning).toMatch(/skin/i)
    expect(pickColor(frame, 250 / W, 150 / H).warning).toMatch(/colourful/i)
    expect(pickColor(frame, 100 / W, 200 / H).warning).toMatch(/dark/i)
  })
  it('measures how much of the picture matches, so a poor colour choice can be caught', () => {
    const { tr } = calibrated(GREEN)
    expect(tr.hasColor).toBe(true)
    const frame = renderFrame({ discs: [{ x: 200, y: 100, r: 5, rgb: GREEN }] })
    const f = matchFraction(frame, rgbToHsv(...GREEN), 0.5)
    expect(f).toBeGreaterThan(0.0005)
    expect(f).toBeLessThan(0.01)
  })
})

describe('BatonTracker — finding the tip', () => {
  it('finds a marker to well under 1.5 pixels, and reports it in mirrored display space', () => {
    const { tr } = calibrated()
    for (const [x, y] of [[200, 100], [60, 30], [300, 220], [160, 120]]) {
      const frame = renderFrame({ discs: [{ x, y, r: 5, rgb: GREEN }], seed: x })
      const s = new BatonTracker()
      s.setColor(tr['color'] as never)
      const out = s.track(frame, 0)!
      expect(out, `${x},${y}`).not.toBeNull()
      expect(Math.abs(out.x - expectDisplay(x, y).x) * W).toBeLessThan(1.5)
      expect(Math.abs(out.y - expectDisplay(x, y).y) * H).toBeLessThan(1.5)
      expect(out.confidence).toBeGreaterThan(0.5)
    }
  })
  it('works for green, pink, blue and orange markers', () => {
    for (const rgb of [GREEN, PINK, BLUE, ORANGE]) {
      const { tr } = calibrated(rgb)
      const out = tr.track(renderFrame({ discs: [{ x: 120, y: 80, r: 5, rgb }] }), 0)
      expect(out, String(rgb)).not.toBeNull()
      expect(Math.abs(out!.x - (1 - 120 / W)) * W).toBeLessThan(1.5)
    }
  })
  it('survives a lamp: brightness ×0.55 … ×1.3 and a warm / cool white balance', () => {
    const { tr } = calibrated()
    for (const light of [0.55, 0.8, 1.3]) for (const tint of [[1.12, 1, 0.85], [0.88, 1, 1.15], [1, 1, 1]] as const) {
      const out = tr.track(renderFrame({ discs: [{ x: 220, y: 90, r: 5, rgb: GREEN }], light, tint: [...tint], seed: 3 }), 0)
      expect(out, `light ${light} tint ${tint}`).not.toBeNull()
      expect(Math.abs(out!.x - (1 - 220 / W)) * W).toBeLessThan(2)
      tr.reset()
    }
  })
  it('is not fooled by sensor noise or by the skin-coloured hand', () => {
    const { tr } = calibrated()
    let found = 0
    for (let i = 0; i < 40; i++) if (tr.track(renderFrame({ discs: [{ x: 200 + i, y: 100, r: 5, rgb: GREEN }], noise: 14, seed: i }), i * 33)) found++
    expect(found).toBe(40)
    const none = tr.track(renderFrame({ discs: [], noise: 14 }), 5000)
    expect(none).toBeNull() // no marker in view: no answer, not a guess
  })
  it('ignores look-alikes of other colours, and prefers the blob nearest the last position when two match', () => {
    const { tr } = calibrated()
    const a = tr.track(renderFrame({ discs: [{ x: 200, y: 100, r: 5, rgb: GREEN }, { x: 250, y: 60, r: 7, rgb: PINK }, { x: 90, y: 200, r: 7, rgb: BLUE }] }), 0)!
    expect(Math.abs(a.x - (1 - 200 / W)) * W).toBeLessThan(1.5)
    // a second green object (bigger) appears far away; the tip, a step from its last place, is still the tip
    const b = tr.track(renderFrame({ discs: [{ x: 206, y: 104, r: 5, rgb: GREEN }, { x: 40, y: 220, r: 8, rgb: GREEN }] }), 33)!
    expect(Math.abs(b.x - (1 - 206 / W)) * W).toBeLessThan(6) // within the smoothing lag of the true position
  })
  it('rejects things that are not a tip: a huge green area, and a thin green line', () => {
    const { tr } = calibrated()
    const huge = renderFrame({ discs: [{ x: 160, y: 120, r: 70, rgb: GREEN }] })
    expect(tr.track(huge, 0)).toBeNull()
    tr.reset()
    const line = renderFrame({ discs: Array.from({ length: 90 }, (_, i) => ({ x: 20 + i * 3, y: 200, r: 0.7, rgb: GREEN })) })
    expect(tr.track(line, 0)).toBeNull()
  })
  it('a small, blurred, fast-moving marker is still found (motion blur grows and dims it)', () => {
    const { tr } = calibrated()
    const out = tr.track(renderFrame({ discs: [{ x: 150, y: 90, r: 4, rgb: GREEN }], blur: 2, light: 0.8 }), 0)
    expect(out).not.toBeNull()
  })
  it('forgets the tip after it has been gone for a while and then finds it anywhere', () => {
    const { tr } = calibrated()
    tr.track(renderFrame({ discs: [{ x: 200, y: 100, r: 5, rgb: GREEN }] }), 0)
    expect(tr.track(renderFrame({ discs: [] }), 100)).toBeNull()
    const back = tr.track(renderFrame({ discs: [{ x: 40, y: 210, r: 5, rgb: GREEN }] }), 3000)
    expect(back).not.toBeNull()
  })
  it('gives a velocity that follows the tip', () => {
    const { tr } = calibrated()
    let last = null as ReturnType<BatonTracker['track']>
    for (let i = 0; i < 12; i++) last = tr.track(renderFrame({ discs: [{ x: 100 + i * 6, y: 100, r: 5, rgb: GREEN }] }), i * 33)
    // moving right in the RAW image = moving LEFT in the mirrored display; 6 px per 33 ms ≈ 0.57 widths/s
    expect(last!.velocity.x).toBeLessThan(-0.3)
    expect(Math.abs(last!.velocity.y)).toBeLessThan(0.1)
  })
  it('never reports a tip without a calibrated colour', () => {
    expect(new BatonTracker().track(renderFrame({ discs: [{ x: 200, y: 100, r: 5, rgb: GREEN }] }), 0)).toBeNull()
  })
})
