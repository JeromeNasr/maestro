import { expect, test } from '@playwright/test'

// Runs only in the 'fake-camera-with-hands' project (set MAESTRO_FAKE_HAND_VIDEO). A clip is not a physical webcam.
test('detects both hands from a video that shows two hands', async ({ page }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Enable camera' }).click()
  await expect(page.getByText('Live camera')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('left-status')).toContainText(/tracking/i, { timeout: 60_000 })
  await expect(page.getByTestId('right-status')).toContainText(/tracking/i)
  await expect(page.getByTestId('handedness-status')).toContainText(/not verified/i) // never claims verification without calibration
})
