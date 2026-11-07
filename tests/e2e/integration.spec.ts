import { expect, test } from '@playwright/test'

test('the Studio can be operated from the keyboard alone', async ({ page }) => {
  await page.goto('/studio')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
  // Tab until the Start button has focus (the skip link, nav and header controls come first)
  let focused = ''
  for (let i = 0; i < 60 && focused !== 'Start'; i++) {
    await page.keyboard.press('Tab')
    focused = (await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '')).replace(/\s+/g, ' ')
  }
  expect(focused).toBe('Start')
  // focus must be visible (an outline is drawn)
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as HTMLElement).outlineStyle)
  expect(outline).not.toBe('none')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  await page.locator('body').click({ position: { x: 5, y: 5 } }) // move focus off any button so Space is the global pause key
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
})

test('mobile layout stays usable while a performance is running and after it ends', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  await page.waitForTimeout(6500)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  const bar = page.getByRole('region', { name: 'Emergency controls' })
  await expect(bar).toBeInViewport() // pause/stop reachable without scrolling
  await bar.getByRole('button', { name: /stop/i }).click()
  await expect(page.getByTestId('session-summary')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

test('a full session (play, tune, mix, pause, stop, analytics) produces no page errors or console errors', async ({ page }) => {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 160)}`)
  })
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Virtual conductor' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  await page.getByText(/^Tuning/).click()
  await page.getByRole('slider', { name: 'Minimum stroke size' }).fill('0.9')
  await page.getByRole('button', { name: 'Mute Brass' }).click()
  await page.getByRole('button', { name: 'Solo Strings' }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Analytics' }).click()
  await expect(page.getByTestId('selected-session')).toBeVisible()
  expect(problems).toEqual([])
})

test('a composition switch loads the new score and the right conducting options', async ({ page }) => {
  await page.goto('/studio')
  await page.getByLabel('Composition').selectOption('parade-march')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Parade March')
  await expect(page.getByLabel('Conduct in')).toHaveValue('2/4')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('audio-status')).toContainText('Audio running')
  await expect.poll(async () => Number(await page.getByTestId('position').getAttribute('data-bar')), { timeout: 15000 }).toBeGreaterThan(2)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
})
