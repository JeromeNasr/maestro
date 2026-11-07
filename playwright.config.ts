import { defineConfig } from '@playwright/test'

/**
 * End-to-end checks against the production build, using Chromium's FAKE capture device (not a physical webcam).
 * First time on a machine:  npx playwright install chromium
 * Run:                      npm run test:e2e
 * Optional hand-detection project: set MAESTRO_FAKE_HAND_VIDEO=/path/to/video.y4m (a clip that shows hands).
 */
const handVideo = process.env.MAESTRO_FAKE_HAND_VIDEO
const fake = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 180_000 },
  use: { baseURL: 'http://localhost:4173', permissions: ['camera'], trace: 'off' },
  projects: [
    { name: 'fake-camera', testIgnore: /hands\.spec\.ts/, use: { launchOptions: { args: [...fake, '--no-sandbox'] } } },
    ...(handVideo
      ? [{ name: 'fake-camera-with-hands', testMatch: /hands\.spec\.ts/, use: { launchOptions: { args: [...fake, `--use-file-for-fake-video-capture=${handVideo}`, '--no-sandbox'] } } }]
      : []),
  ],
})
