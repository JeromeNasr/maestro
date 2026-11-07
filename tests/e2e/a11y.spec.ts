import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** WCAG 2.1 A/AA scan. Fails on serious or critical violations (the ones that block real users). */
async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(summary, `${label}: ${summary.join('\n')}`).toEqual([])
}

for (const [name, path] of [['landing', '/'], ['library', '/library'], ['academy', '/academy'], ['analytics', '/analytics'], ['not found', '/nope']] as const) {
  test(`${name} page has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await scan(page, name)
  })
}

test('studio (idle, running with the virtual conductor, and with a finished summary) has no serious accessibility violations', async ({ page }) => {
  await page.goto('/studio')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
  await scan(page, 'studio idle')
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  await page.getByText(/^Tuning/).click()
  await page.getByText('Instruments in this piece').click()
  await page.waitForTimeout(6500)
  await scan(page, 'studio running')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByTestId('session-summary')).toBeVisible()
  await scan(page, 'studio summary')
})

test('academy lesson with quiz result and exercises has no serious accessibility violations', async ({ page }) => {
  await page.goto('/academy')
  await page.getByRole('button', { name: /Tempo control/ }).click()
  for (const q of ['120 beats per minute', 'Stays the same', 'A lone outlier is probably a mistake, not a new tempo']) await page.getByRole('radio', { name: q }).check().catch(() => undefined)
  await scan(page, 'academy lesson')
  await page.getByRole('button', { name: /4\/4 — conducting in four/ }).click()
  await page.getByRole('button', { name: /Open exercise/ }).click()
  await scan(page, 'academy camera exercise')
})
