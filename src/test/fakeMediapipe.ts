/** Stand-in for the MediaPipe detector factory in UI tests (the real model is exercised by the Playwright tests). */
export const detectors: { closed: boolean }[] = []
export const createMediaPipeDetector = async () => {
  const d = {
    delegate: 'CPU' as const, assetOrigin: 'test' as const, closed: false,
    detect: () => ({ hands: [] }), setMinConfidence: () => undefined, close() { d.closed = true },
  }
  detectors.push(d)
  return d
}
