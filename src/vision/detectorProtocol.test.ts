
describe('confidenceTriplet', () => {
  it('detection is the strictest, tracking the most forgiving, and all stay inside MediaPipe’s range', async () => {
    const { confidenceTriplet } = await import('./detectorProtocol')
    for (const c of [0.2, 0.45, 0.6, 0.95]) {
      const t = confidenceTriplet(c)
      expect(t.detection).toBeGreaterThanOrEqual(t.presence)
      expect(t.presence).toBeGreaterThanOrEqual(t.tracking)
      for (const v of Object.values(t)) expect(v > 0 && v < 1).toBe(true)
    }
    expect(confidenceTriplet(0.6).tracking).toBeLessThan(0.5) // below MediaPipe's own default, so a quick hand is followed, not dropped
  })
})
