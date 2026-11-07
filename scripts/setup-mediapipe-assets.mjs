// Copies the MediaPipe WASM runtime from node_modules into public/ so the app can self-host it (offline-capable),
// and downloads the hand model if it is missing. Runs on `npm install`/`npm ci`. Never fails the install:
// if something is unavailable, the app falls back to the public CDN at runtime.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDst = join(root, 'public/mediapipe/wasm')
const modelDst = join(root, 'public/models/hand_landmarker.task')
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

try {
  if (existsSync(wasmSrc)) {
    mkdirSync(wasmDst, { recursive: true })
    cpSync(wasmSrc, wasmDst, { recursive: true })
    console.log('[maestro] MediaPipe WASM copied to public/mediapipe/wasm')
  } else {
    console.warn('[maestro] @mediapipe/tasks-vision not installed yet; skipping WASM copy (CDN fallback will be used).')
  }
} catch (e) {
  console.warn('[maestro] Could not copy MediaPipe WASM:', e.message)
}

if (!existsSync(modelDst)) {
  try {
    const res = await fetch(MODEL_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    mkdirSync(dirname(modelDst), { recursive: true })
    writeFileSync(modelDst, Buffer.from(await res.arrayBuffer()))
    console.log('[maestro] Downloaded hand_landmarker.task to public/models')
  } catch (e) {
    console.warn(`[maestro] Could not download the hand model (${e.message}). The app will load it from the CDN at runtime.`)
  }
}
