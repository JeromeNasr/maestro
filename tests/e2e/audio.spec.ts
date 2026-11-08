import { expect, test, type Page } from '@playwright/test'
import { instrumentCamera } from './helpers'

/**
 * Real Chromium Web Audio: the recorded orchestra loads, every family sounds, nothing clips, and the output is measured
 * on the actual signal that reaches the speakers (a tap on every node connected to the AudioContext destination).
 */
async function tapOutput(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tap: { analysers: AnalyserNode[]; peak: number }; AudioNode: typeof AudioNode }
    w.__tap = { analysers: [], peak: 0 }
    const proto = w.AudioNode.prototype
    const orig = proto.connect as (this: AudioNode, ...a: unknown[]) => unknown
    proto.connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
      if (dest instanceof AudioDestinationNode) {
        const a = this.context.createAnalyser()
        a.fftSize = 2048
        orig.call(this, a)
        w.__tap.analysers.push(a)
      }
      return orig.call(this, dest, ...rest)
    } as typeof proto.connect
  })
}
const outputPeak = (page: Page, ms: number) =>
  page.evaluate(async (dur) => {
    const w = window as unknown as { __tap: { analysers: AnalyserNode[] } }
    const buf = new Float32Array(2048)
    let peak = 0
    const t0 = performance.now()
    while (performance.now() - t0 < dur) {
      for (const a of w.__tap.analysers) {
        a.getFloatTimeDomainData(buf)
        for (const v of buf) peak = Math.max(peak, Math.abs(v))
      }
      await new Promise((r) => setTimeout(r, 15))
    }
    return peak
  }, ms)

test.beforeEach(async ({ page }) => {
  await instrumentCamera(page)
  await tapOutput(page)
})

test('the recorded orchestra loads (not the synth fallback) and plays without clipping', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('sound-source')).toHaveAttribute('data-kind', 'sampled', { timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled({ timeout: 60_000 }) // samples loaded, playing
  await expect(page.getByTestId('sound-source')).toContainText('CC0')
  await expect(page.getByTestId('sound-source')).not.toContainText('fallback')
  // Only the instruments the piece uses were fetched, all from this origin.
  const samples = requests.filter((u) => u.includes('/samples/') && u.endsWith('.ogg'))
  expect(samples.length).toBeGreaterThan(20)
  expect(new Set(samples).size).toBeLessThanOrEqual(149) // never more than the whole library, each file once
  // Audio never leaves the origin (the only third-party requests are the Google Fonts stylesheet/files, which carry no user data).
  const foreign = requests.filter((u) => !/^(data|blob):/.test(u) && new URL(u).origin !== new URL(page.url()).origin && !/fonts\.(googleapis|gstatic)\.com/.test(u))
  expect(foreign).toEqual([])
  await page.waitForTimeout(1500)
  const peak = await outputPeak(page, 6000)
  expect(peak).toBeGreaterThan(0.02) // audible
  expect(peak).toBeLessThanOrEqual(0.99) // −0.09 dBFS: the soft clipper guarantees headroom
  expect(errors).toEqual([])
})

test('master at maximum and fortissimo cannot clip', async ({ page }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('checkbox', { name: /tracking dropouts/ }).uncheck()
  await page.getByRole('checkbox', { name: /waves by itself/ }).uncheck()
  await page.getByRole('radio', { name: 'Fixed tempo' }).check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled({ timeout: 60_000 })
  await expect(page.getByTestId('sound-source')).toHaveAttribute('data-kind', 'sampled')
  await page.getByRole('slider', { name: /Fixed tempo as a percentage/ }).fill('150')
  await page.getByRole('slider', { name: /left hand height/ }).fill('0.97')
  await page.getByRole('slider', { name: /master/i }).fill('1')
  await page.waitForTimeout(30_000) // reach the tutti
  const peak = await outputPeak(page, 20_000)
  expect(peak).toBeGreaterThan(0.1)
  expect(peak).toBeLessThanOrEqual(0.99)
})

test('a real classic (Beethoven 5) loads its 12 instruments, every family sounds, and nothing clips', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('/library')
  await page.getByRole('article', { name: /symphony no\. 5/i }).getByRole('button', { name: /select for studio/i }).click()
  await page.goto('/studio')
  await expect(page.getByRole('heading', { level: 1, name: /symphony no\. 5/i })).toBeVisible()
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('checkbox', { name: /tracking dropouts/ }).uncheck()
  await page.getByRole('checkbox', { name: /waves by itself/ }).uncheck()
  const t0 = Date.now()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled({ timeout: 90_000 })
  const loadMs = Date.now() - t0
  await expect(page.getByTestId('sound-source')).toHaveAttribute('data-kind', 'sampled')
  const samples = new Set(requests.filter((u) => u.includes('/samples/') && u.endsWith('.ogg')))
  // 11 sampled instruments (violins II reuse the violins): strings 4 sets, woodwinds 4, brass 2 (horns, trumpets), timpani
  const dirs = new Set([...samples].map((u) => u.split('/samples/')[1].split('/')[0]))
  expect([...dirs].sort()).toEqual(['basses', 'bassoons', 'cellos', 'clarinets', 'flutes', 'horns', 'oboes', 'timpani', 'trumpets', 'violas', 'violins'])
  const levels = { Strings: 0, Woodwinds: 0, Brass: 0, Percussion: 0 }
  const t1 = Date.now()
  let peak = 0
  while (Date.now() - t1 < 45_000) {
    for (const k of Object.keys(levels) as (keyof typeof levels)[]) levels[k] = Math.max(levels[k], Number(await page.getByRole('meter', { name: `${k} output level` }).getAttribute('aria-valuenow')))
    peak = Math.max(peak, await outputPeak(page, 150))
  }
  console.log(`BEETHOVEN loadMs=${loadMs} files=${samples.size} peak=${peak.toFixed(3)} levels=${JSON.stringify(levels)}`)
  expect(levels.Strings).toBeGreaterThan(0.2)
  expect(levels.Woodwinds).toBeGreaterThan(0.1)
  expect(levels.Brass).toBeGreaterThan(0.1)
  expect(peak).toBeLessThanOrEqual(0.99)
  // Timpani are sparse and short; judge them on the actual output peak with only the percussion soloed.
  await page.getByRole('radio', { name: 'Fixed tempo' }).check()
  await page.getByRole('slider', { name: /Fixed tempo as a percentage/ }).fill('150')
  await page.getByRole('button', { name: 'Solo Percussion' }).click()
  await page.waitForTimeout(500)
  const timpaniPeak = await outputPeak(page, 25_000)
  console.log(`BEETHOVEN percussion-only output peak=${timpaniPeak.toFixed(3)}`)
  expect(timpaniPeak).toBeGreaterThan(0.12)
})
