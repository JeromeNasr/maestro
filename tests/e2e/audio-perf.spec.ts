import { expect, test, type Page } from '@playwright/test'

/**
 * Measured comparison of the two sound sources on the same piece: the recorded orchestra (default) versus the synthesiser
 * fallback (forced by making the sample manifest unavailable). Numbers are printed; thresholds only catch regressions.
 * Headless Chromium on a software audio device: these are relative numbers for this machine, not absolute claims.
 */
async function measure(page: Page, label: string, blockSamples: boolean) {
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
  if (blockSamples) await page.route('**/samples/manifest.json', (r) => r.fulfill({ status: 404, body: 'blocked for the comparison' }))
  const bytes = { samples: 0, js: 0 }
  page.on('response', async (r) => {
    const u = r.url()
    const len = Number(r.headers()['content-length'] ?? 0)
    if (u.includes('/samples/')) bytes.samples += len
    else if (u.endsWith('.js')) bytes.js += len
  })
  await page.goto('/library')
  await page.getByRole('article', { name: /symphony no\. 5/i }).getByRole('button', { name: /select for studio/i }).click()
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('checkbox', { name: /tracking dropouts/ }).uncheck()
  await page.getByRole('checkbox', { name: /waves by itself/ }).uncheck()
  await page.getByRole('radio', { name: 'Fixed tempo' }).check()
  const t0 = Date.now()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled({ timeout: 90_000 })
  const startMs = Date.now() - t0
  await expect(page.getByTestId('sound-source')).toHaveAttribute('data-kind', blockSamples ? 'tone' : 'sampled')
  await page.getByRole('slider', { name: /Fixed tempo as a percentage/ }).fill('150')
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __gaps: number[] }
    w.__long.length = 0
    w.__gaps.length = 0
  })
  await page.waitForTimeout(40_000) // tutti: every instrument sounding
  const r = await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __gaps: number[] }
    const g = [...w.__gaps].sort((a, b) => a - b)
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    return { frames: g.length, p50: g[Math.floor(g.length * 0.5)], p95: g[Math.floor(g.length * 0.95)], max: g.at(-1), longTotal: Math.round(w.__long.reduce((a, b) => a + b, 0)), longCount: w.__long.length, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null }
  })
  const lateNotes = await page.getByTestId('late-notes').count()
  const source = (await page.getByTestId('sound-source').textContent()) ?? ''
  const out = { label, source, startMs, ...r, lateNotes, fetchedSamplesKB: Math.round(bytes.samples / 1024), fetchedJsKB: Math.round(bytes.js / 1024) }
  // eslint-disable-next-line no-console -- measured values are reported for the record
  console.log(`PERF ${JSON.stringify(out)}`)
  return out
}

test('sampled orchestra vs synthesiser: UI smoothness and dropped notes (measured)', async ({ browser }) => {
  const a = await measure(await (await browser.newContext()).newPage(), 'sampled', false)
  const b = await measure(await (await browser.newContext()).newPage(), 'synth', true)
  for (const m of [a, b]) {
    expect(m.lateNotes).toBe(0)
    expect(m.p95).toBeLessThan(60)
  }
})
