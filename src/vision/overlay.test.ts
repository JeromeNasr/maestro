import { trackedHand, EMPTY_TRACKING } from '@/test/fixtures'
import { drawHands, type OverlayContext } from './overlay'
import type { HandFrame } from './types'

function mockCtx() {
  const calls: Record<string, number> = {}
  const strokeAlphas: number[] = []
  const texts: string[] = []
  const ctx = {
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic',
  } as Record<string, unknown>
  for (const name of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'fill', 'save', 'restore', 'setLineDash']) {
    ctx[name] = () => void (calls[name] = (calls[name] ?? 0) + 1)
  }
  ctx.stroke = () => {
    calls.stroke = (calls.stroke ?? 0) + 1
    strokeAlphas.push(ctx.globalAlpha as number)
  }
  ctx.fillText = (t: string) => void texts.push(t)
  return { ctx: ctx as unknown as OverlayContext, calls, strokeAlphas, texts }
}

const frameOf = (l: ReturnType<typeof trackedHand> | null, r: ReturnType<typeof trackedHand> | null): HandFrame => ({
  timestampMs: 0, source: 'camera', left: l, right: r, detections: [], tracking: EMPTY_TRACKING,
})

describe('drawHands', () => {
  it('draws 21 landmark points and 21 bones for one hand, plus its label', () => {
    const m = mockCtx()
    drawHands(m.ctx, frameOf(null, trackedHand('right', 0.7, 0.5)), 640, 480)
    // 21 landmark dots + 1 palm ring
    expect(m.calls.arc).toBe(22)
    expect(m.calls.lineTo).toBe(21)
    expect(m.texts).toEqual(['RIGHT · BEAT 95%'])
  })

  it('draws both hands', () => {
    const m = mockCtx()
    drawHands(m.ctx, frameOf(trackedHand('left', 0.3, 0.5), trackedHand('right', 0.7, 0.5)), 640, 480)
    expect(m.calls.arc).toBe(44)
    expect(m.texts).toEqual(['LEFT · DYNAMICS 95%', 'RIGHT · BEAT 95%'])
  })

  it('draws a held (temporarily lost) hand dimmed and says so', () => {
    const m = mockCtx()
    drawHands(m.ctx, frameOf(null, trackedHand('right', 0.7, 0.5, 'holding')), 640, 480)
    expect(Math.max(...m.strokeAlphas)).toBeLessThan(0.5)
    expect(m.texts[0]).toMatch(/signal lost/)
  })

  it('only clears the canvas when there is no frame or no hands', () => {
    const a = mockCtx()
    drawHands(a.ctx, null, 640, 480)
    expect(a.calls).toEqual({ clearRect: 1 })
    const b = mockCtx()
    drawHands(b.ctx, frameOf(null, null), 640, 480)
    expect(b.calls.arc).toBeUndefined()
  })

  it('scales normalised coordinates to the canvas size', () => {
    const m = mockCtx()
    const moves: number[][] = []
    ;(m.ctx as unknown as { moveTo: (x: number, y: number) => void }).moveTo = (x, y) => void moves.push([x, y])
    const h = trackedHand('right', 0.7, 0.5)
    drawHands(m.ctx, frameOf(null, h), 1000, 500)
    expect(moves[0][0]).toBeCloseTo(h.landmarks[0].x * 1000)
    expect(moves[0][1]).toBeCloseTo(h.landmarks[0].y * 500)
  })
})
