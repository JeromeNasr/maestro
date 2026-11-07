import type { Page } from '@playwright/test'

/** Counts getUserMedia calls and keeps the streams so tests can verify the camera is released. */
export async function instrumentCamera(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __gum: number; __streams: MediaStream[] }
    w.__gum = 0
    w.__streams = []
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (c) => {
      w.__gum++
      const s = await orig(c)
      w.__streams.push(s)
      return s
    }
  })
}
export const gumCalls = (page: Page) => page.evaluate(() => (window as unknown as { __gum: number }).__gum)
export const trackStates = (page: Page) =>
  page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks().map((t) => t.readyState)))
