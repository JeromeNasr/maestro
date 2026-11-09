import { expect, test, type Page } from '@playwright/test'
import { gumCalls, instrumentCamera, trackStates } from './helpers'

/** Record every AudioContext the page creates, so tests can verify they are all closed again. */
async function trackAudioContexts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ctxs: AudioContext[]; AudioContext: typeof AudioContext }
    w.__ctxs = []
    const Orig = w.AudioContext
    w.AudioContext = class extends Orig {
      constructor(o?: AudioContextOptions) {
        super(o)
        w.__ctxs.push(this)
      }
    } as typeof AudioContext
  })
}
const ctxStates = (page: Page) => page.evaluate(() => (window as unknown as { __ctxs: AudioContext[] }).__ctxs.map((c) => c.state))

const level = async (page: Page, section: string) => Number(await page.getByRole('meter', { name: `${section} output level` }).getAttribute('aria-valuenow'))
const numberIn = async (page: Page, testId: string) => Number((await page.getByTestId(testId).textContent())?.replace(/[^0-9.]/g, '') || NaN)
/** Quarter-note position (the Aurora Étude is in 4/4): read from data attributes, not from text. */
const beatsPlayed = async (page: Page) => {
  const el = page.getByTestId('position')
  return (Number(await el.getAttribute('data-bar')) - 1) * 4 + Number(await el.getAttribute('data-beat'))
}
const transport = (page: Page, name: 'Pause' | 'Resume' | 'Stop' | 'Start') => page.getByRole('button', { name, exact: true })
const setRange = (page: Page, name: string | RegExp, v: number) => page.getByRole('slider', { name }).fill(String(v))

test.beforeEach(async ({ page }) => {
  await instrumentCamera(page)
  await trackAudioContexts(page)
})

test('all five pages load and navigation works (desktop and mobile widths)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp)
    await page.goto('/')
    for (const [label, path, h1] of [['Library', '/library', /choose your repertoire/i], ['Studio', '/studio', /aurora/i], ['Academy', '/academy', /learn the language/i], ['Orchestra', '/orchestra', /who is in the orchestra/i], ['Analytics', '/analytics', /your performances/i]] as const) {
      if (vp.width < 768) await page.getByRole('button', { name: /menu/i }).click()
      await page.getByRole('navigation', { name: vp.width < 768 ? 'Mobile' : 'Primary' }).getByRole('link', { name: label }).click()
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(h1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    }
  }
  expect(errors).toEqual([])
})

test('nothing starts on load: no camera, no AudioContext', async ({ page }) => {
  await page.goto('/studio')
  await expect(transport(page, 'Start')).toBeEnabled()
  await page.waitForTimeout(1500)
  expect(await gumCalls(page)).toBe(0)
  expect(await ctxStates(page)).toEqual([])
})

test('demo composition really plays: audio starts on click, every section sounds, pause silences, stop rewinds', async ({ page }) => {
  await page.goto('/studio')
  await transport(page, 'Start').click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  const states = await ctxStates(page)
  expect(states.filter((s) => s === 'running')).toHaveLength(1) // exactly one live context…
  expect(states.filter((s) => s !== 'running').every((s) => s === 'closed')).toBe(true) // …and Tone's import-time default was closed
  // the opening is strings only (by design); the full orchestra enters at bar 9 — raise the tempo to get there quickly
  await page.getByRole('radio', { name: 'Fixed tempo' }).check()
  await setRange(page, /Fixed tempo as a percentage/, 150)
  await expect.poll(() => level(page, 'Strings'), { timeout: 10_000 }).toBeGreaterThan(0.1)
  await expect.poll(async () => (await beatsPlayed(page)) > 36, { timeout: 40_000 }).toBe(true)
  await expect.poll(() => level(page, 'Brass'), { timeout: 30_000 }).toBeGreaterThan(0.1) // the brass have entered
  await transport(page, 'Pause').click()
  await expect(transport(page, 'Resume')).toBeEnabled()
  await expect.poll(() => level(page, 'Strings'), { timeout: 5_000 }).toBeLessThan(0.03) // actually silent, measured
  const frozen = await beatsPlayed(page)
  await page.waitForTimeout(1500)
  expect(await beatsPlayed(page)).toBe(frozen) // position frozen while paused
  await transport(page, 'Resume').click()
  await expect.poll(() => beatsPlayed(page)).toBeGreaterThan(frozen)
  await transport(page, 'Stop').click()
  await expect(page.getByTestId('position')).toContainText('Bar 1 · beat 1')
  await expect.poll(() => level(page, 'Strings'), { timeout: 5_000 }).toBeLessThan(0.03)
})

test('virtual conductor: the right hand sets the tempo, and a tempo change changes how fast the music advances', async ({ page }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('checkbox', { name: /tracking dropouts/ }).uncheck()
  await setRange(page, /Virtual conductor tempo/, 70)
  await transport(page, 'Start').click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  await expect.poll(() => numberIn(page, 'readout-your-tempo'), { timeout: 30_000 }).toBeGreaterThan(62)
  expect(await numberIn(page, 'readout-your-tempo')).toBeLessThan(78)
  await expect.poll(() => numberIn(page, 'readout-music-tempo'), { timeout: 20_000 }).toBeLessThan(80)
  const b0 = await beatsPlayed(page)
  await page.waitForTimeout(6000)
  const slowRate = ((await beatsPlayed(page)) - b0) / 6 // quarter notes per second ≈ 70/60
  expect(slowRate).toBeGreaterThan(0.9)
  expect(slowRate).toBeLessThan(1.5)

  await setRange(page, /Virtual conductor tempo/, 130)
  await expect.poll(() => numberIn(page, 'readout-your-tempo'), { timeout: 40_000 }).toBeGreaterThan(118)
  await expect.poll(() => numberIn(page, 'readout-music-tempo'), { timeout: 20_000 }).toBeGreaterThan(115)
  const b1 = await beatsPlayed(page)
  await page.waitForTimeout(6000)
  const fastRate = ((await beatsPlayed(page)) - b1) / 6
  expect(fastRate).toBeGreaterThan(slowRate * 1.5) // the same score, scheduled faster
  await expect(page.getByTestId('conducting-state')).toHaveText('Conducting')
})

test('left hand → dynamics: pp is audibly quieter than ff (measured from the audio output)', async ({ page }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('checkbox', { name: /tracking dropouts/ }).uncheck()
  await page.getByRole('checkbox', { name: /waves by itself/ }).uncheck()
  await page.getByRole('radio', { name: 'Fixed tempo' }).check() // keep the music steady so only dynamics differ
  await transport(page, 'Start').click()
  const peak = async (ms: number) => {
    let m = 0
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      m = Math.max(m, await level(page, 'Strings'))
      await page.waitForTimeout(100)
    }
    return m
  }
  await setRange(page, /left hand height/, 0.06)
  await expect(page.getByTestId('readout-dynamics')).toHaveText('pp', { timeout: 15_000 })
  await page.waitForTimeout(1500)
  const quiet = await peak(2500)
  await setRange(page, /left hand height/, 0.95)
  await expect(page.getByTestId('readout-dynamics')).toHaveText('ff', { timeout: 15_000 })
  await page.waitForTimeout(1500)
  const loud = await peak(2500)
  expect(loud).toBeGreaterThan(0.15)
  expect(loud).toBeGreaterThan(quiet + 0.15) // ≥ ~8 dB louder on the 54 dB meter scale
})

test('mute and solo change the real output of each section', async ({ page }) => {
  await page.goto('/studio')
  await transport(page, 'Start').click()
  await page.getByRole('radio', { name: 'Fixed tempo' }).check()
  await setRange(page, /Fixed tempo as a percentage/, 150)
  await expect.poll(async () => (await beatsPlayed(page)) > 34, { timeout: 40_000 }).toBe(true) // the whole orchestra is playing
  const peak = async (s: string) => {
    let m = 0
    for (let i = 0; i < 12; i++) {
      m = Math.max(m, await level(page, s))
      await page.waitForTimeout(100)
    }
    return m
  }
  expect(await peak('Brass')).toBeGreaterThan(0.1)
  await page.getByRole('button', { name: 'Mute Brass' }).click()
  await page.waitForTimeout(1200)
  expect(await peak('Brass')).toBeLessThan(0.03)
  expect(await peak('Strings')).toBeGreaterThan(0.1) // the others keep playing
  await page.getByRole('button', { name: 'Mute Brass' }).click()
  await page.getByRole('button', { name: 'Solo Woodwinds' }).click()
  await page.waitForTimeout(1500)
  expect(await peak('Strings')).toBeLessThan(0.03)
  expect(await peak('Brass')).toBeLessThan(0.03)
  expect(await peak('Woodwinds')).toBeGreaterThan(0.1)
})

test('emergency stop: Esc and the always-visible bar silence the music immediately', async ({ page }) => {
  await page.goto('/studio')
  await transport(page, 'Start').click()
  const bar = page.getByRole('region', { name: 'Emergency controls' })
  await expect(bar).toBeVisible()
  await expect(bar.getByRole('button', { name: /pause/i })).toBeInViewport()
  await page.keyboard.press('Space')
  await expect(bar.getByRole('button', { name: /resume/i })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
  await expect.poll(() => level(page, 'Strings'), { timeout: 5000 }).toBeLessThan(0.03)
})

test('leaving the Studio releases the audio engine (every AudioContext is closed)', async ({ page }) => {
  await page.goto('/studio')
  await transport(page, 'Start').click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  expect((await ctxStates(page)).includes('running')).toBe(true)
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Library' }).click()
  await expect.poll(async () => (await ctxStates(page)).every((s) => s === 'closed'), { timeout: 5000 }).toBe(true)
})

test('a performance is saved and shown in Analytics with real values — and unavailable ones marked as such', async ({ page }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('checkbox', { name: /tracking dropouts/ }).uncheck()
  await setRange(page, /Virtual conductor tempo/, 100)
  await transport(page, 'Start').click()
  await expect.poll(() => numberIn(page, 'readout-your-tempo'), { timeout: 30_000 }).toBeGreaterThan(90)
  await page.waitForTimeout(6000)
  await transport(page, 'Stop').click()
  const summary = page.getByTestId('session-summary')
  await expect(summary).toBeVisible()
  await expect(summary).toContainText('Demo conductor (synthetic)')
  await summary.getByRole('link', { name: 'View analytics' }).click()
  const sel = page.getByTestId('selected-session')
  await expect(sel).toContainText('Aurora Étude')
  await expect(sel).toContainText('Synthetic conductor')
  expect(await numberIn(page, 'metric-average-tempo')).toBeGreaterThan(85)
  await expect(page.getByTestId('metric-duration-played')).toContainText('Measured')
  await expect(page.getByTestId('metric-pattern-adherence')).toContainText('Estimate')

  // a playback-only session (no hands) has unavailable tracking
  await page.goto('/studio')
  await transport(page, 'Start').click()
  await page.getByRole('radio', { name: 'Fixed tempo' }).check()
  await page.waitForTimeout(6500)
  await transport(page, 'Stop').click()
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Analytics' }).click()
  const latest = page.getByTestId('selected-session')
  await expect(latest).toContainText('Playback only')
  for (const id of ['metric-average-tempo', 'metric-right-hand-tracked', 'metric-left-hand-tracked']) await expect(page.getByTestId(id)).toContainText('Unavailable')
})

test('real camera pipeline (Chromium fake device): the camera is released on Stop and when leaving the Studio', async ({ page }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Enable camera' }).click()
  await expect(page.getByText('Live camera')).toBeVisible({ timeout: 60_000 })
  expect(await gumCalls(page)).toBe(1)
  await transport(page, 'Start').click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  await page.getByRole('button', { name: 'Stop camera' }).click()
  expect(await trackStates(page)).toEqual(['ended'])
  await page.getByRole('button', { name: 'Enable camera' }).click()
  await expect(page.getByText('Live camera')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Academy' }).click()
  await expect.poll(() => trackStates(page)).toEqual(['ended', 'ended'])
  await expect.poll(async () => (await ctxStates(page)).every((s) => s === 'closed')).toBe(true)
})

test('Academy: a quiz is scored and persisted across a reload; tap-tempo is judged from real taps', async ({ page }) => {
  await page.goto('/academy')
  await expect(page.getByTestId('course-progress')).toContainText('0 of 11')
  await page.getByRole('button', { name: 'Mark as read' }).click()
  for (const q of ['The right hand', 'At the ictus, where the stroke changes direction', 'A gesture before the first note showing tempo and character']) await page.getByRole('radio', { name: q }).check()
  await page.getByRole('button', { name: 'Check answers' }).click()
  await expect(page.getByTestId('quiz-result')).toContainText('3 of 3 correct')
  await page.reload()
  await expect(page.getByTestId('course-progress')).toContainText('1 of 11')

  await page.getByRole('button', { name: /Tempo control/ }).click()
  const pad = page.getByRole('button', { name: 'Tap' })
  for (let i = 0; i < 12; i++) {
    await pad.click()
    await page.waitForTimeout(750)
  }
  await expect(page.getByTestId('tap-result')).toBeVisible()
  const r = await page.getByTestId('tap-result').textContent()
  expect(r).toMatch(/Your tempo \d+\.\d BPM/)
})
