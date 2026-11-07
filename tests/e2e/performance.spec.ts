import { expect, test } from '@playwright/test'

/**
 * Guards the reason hand detection runs in a Web Worker: measured on the main thread, MediaPipe inference kept the page
 * ~97% busy (UI at ~12 fps, audio notes dropped). With the worker the UI must stay near 60 fps while the camera,
 * hand tracking and the music all run together.
 */
test('UI stays responsive and no audio is dropped while camera tracking and music run together', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __long: number[]; __gaps: number[] }
    w.__long = []
    w.__gaps = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ entryTypes: ['longtask'] })
    let last = performance.now()
    const tick = () => {
      const n = performance.now()
      w.__gaps.push(n - last)
      last = n
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Enable camera' }).click()
  await expect(page.getByText('Live camera')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  await expect(page.getByTestId('perf-status')).toContainText('CPU', { timeout: 90_000 }) // the slow-GPU → CPU switch has settled in headless CI
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __gaps: number[] }
    w.__long.length = 0
    w.__gaps.length = 0
  })
  await page.waitForTimeout(10_000)
  const r = await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __gaps: number[] }
    const g = [...w.__gaps].sort((a, b) => a - b)
    return { frames: g.length, p50: g[Math.floor(g.length * 0.5)], p95: g[Math.floor(g.length * 0.95)], longTotal: w.__long.reduce((a, b) => a + b, 0) }
  })
  expect(r.frames).toBeGreaterThan(300) // ≥ 30 fps on average
  expect(r.p95).toBeLessThan(50)
  expect(r.longTotal).toBeLessThan(1500) // < 15% of the window spent in long tasks (main-thread inference measured ~97%)
  await expect(page.getByTestId('late-notes')).toHaveCount(0) // the audio scheduler dropped nothing
})
