import { readFileSync } from 'node:fs'
import { CDN_ASSETS, MEDIAPIPE_VERSION, resolveAssets } from './assetLoader'

const resp = (ok: boolean, type = 'application/octet-stream') => Promise.resolve({ ok, headers: { get: () => type } })

describe('resolveAssets', () => {
  it('prefers the self-hosted copies when present', async () => {
    const a = await resolveAssets(() => resp(true))
    expect(a.origin).toBe('local')
    expect(a.modelUrl).toBe('/models/hand_landmarker.task')
    expect(a.wasmBase).toBe('/mediapipe/wasm')
  })
  it('honours a non-root base path', async () => {
    expect((await resolveAssets(() => resp(true), '/app/')).modelUrl).toBe('/app/models/hand_landmarker.task')
  })
  it('falls back to the CDN when the local model is missing', async () => {
    expect(await resolveAssets(() => resp(false))).toEqual(CDN_ASSETS)
  })
  it('detects dev-server SPA fallbacks (HTML served with 200) as "missing"', async () => {
    expect((await resolveAssets(() => resp(true, 'text/html; charset=utf-8'))).origin).toBe('cdn')
  })
  it('falls back when the check itself fails (offline)', async () => {
    expect((await resolveAssets(() => Promise.reject(new Error('offline')))).origin).toBe('cdn')
  })
  it('falls back if only the model (but not the runtime) is available', async () => {
    const a = await resolveAssets((u) => (u.endsWith('.task') ? resp(true) : resp(false)))
    expect(a.origin).toBe('cdn')
  })
  it('pins the CDN runtime to the installed @mediapipe/tasks-vision version', () => {
    const pkg = JSON.parse(readFileSync('node_modules/@mediapipe/tasks-vision/package.json', 'utf8'))
    expect(MEDIAPIPE_VERSION).toBe(pkg.version)
    expect(CDN_ASSETS.wasmBase).toContain(`@${pkg.version}/`)
  })
})
