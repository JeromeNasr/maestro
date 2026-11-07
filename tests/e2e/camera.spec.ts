import { expect, test } from '@playwright/test'
import { gumCalls, instrumentCamera, trackStates } from './helpers'

test.beforeEach(async ({ page }) => instrumentCamera(page))

test('does not touch the camera when the Studio loads', async ({ page }) => {
  await page.goto('/studio')
  await expect(page.getByText('Camera is off')).toBeVisible()
  await page.waitForTimeout(1500)
  expect(await gumCalls(page)).toBe(0)
})

test('Enable camera → live tracking with the real MediaPipe model; Stop and leaving the page release the camera', async ({ page }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Enable camera' }).click()
  await expect(page.getByText('Live camera')).toBeVisible({ timeout: 60_000 })
  expect(await gumCalls(page)).toBe(1)
  await expect(page.getByTestId('perf-status')).toContainText('model: local')
  await expect(page.getByText(/No hands detected/)).toBeVisible() // the default fake feed has no hands

  await page.getByRole('button', { name: 'Stop camera' }).click()
  await expect(page.getByText('Camera is off')).toBeVisible()
  expect(await trackStates(page)).toEqual(['ended'])

  await page.getByRole('button', { name: 'Enable camera' }).click()
  await expect(page.getByText('Live camera')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Library' }).click()
  await expect.poll(() => trackStates(page)).toEqual(['ended', 'ended'])
})

test('camera pipeline makes no external network requests (video stays local)', async ({ page, context }) => {
  const external: string[] = []
  context.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith('http://localhost:4173') && !/fonts\.(googleapis|gstatic)\.com/.test(u)) external.push(`${r.method()} ${u}`)
  })
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Enable camera' }).click()
  await expect(page.getByText('Live camera')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(25_000) // long enough for MediaPipe's delayed usage-logging attempt (blocked by CSP)
  expect(external).toEqual([])
})

test('demonstration mode needs no camera', async ({ page }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Demo mode' }).click()
  await expect(page.getByText(/synthetic hands/).first()).toBeVisible()
  await expect(page.getByTestId('left-status')).toContainText(/tracking/i)
  expect(await gumCalls(page)).toBe(0)
})
