/**
 * MediaPipe asset resolution: prefer the self-hosted copies (served from this site, work offline), and fall back to
 * public CDNs only if the local files are missing. The video itself is never sent anywhere either way — these are
 * one-off downloads of the model/runtime.
 */
// Keep in sync with the installed @mediapipe/tasks-vision (asserted by a unit test).
export const MEDIAPIPE_VERSION = '1.2.2'

export interface AssetLocation {
  wasmBase: string
  modelUrl: string
  origin: 'local' | 'cdn'
}

export const CDN_ASSETS: AssetLocation = {
  wasmBase: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
  modelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  origin: 'cdn',
}

export const localAssets = (base = '/'): AssetLocation => ({
  wasmBase: `${base}mediapipe/wasm`,
  modelUrl: `${base}models/hand_landmarker.task`,
  origin: 'local',
})

type FetchLike = (url: string, init?: { method?: string }) => Promise<{ ok: boolean; headers: { get(name: string): string | null } }>

/** A dev/preview server answers unknown paths with index.html (200), so check the content type too. */
async function exists(fetchFn: FetchLike, url: string): Promise<boolean> {
  try {
    const r = await fetchFn(url, { method: 'HEAD' })
    return r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')
  } catch {
    return false
  }
}

export async function resolveAssets(fetchFn: FetchLike = (u, i) => fetch(u, i), base = '/'): Promise<AssetLocation> {
  const local = localAssets(base)
  const ok = (await exists(fetchFn, local.modelUrl)) && (await exists(fetchFn, `${local.wasmBase}/vision_wasm_internal.wasm`))
  return ok ? local : CDN_ASSETS
}
