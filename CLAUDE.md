# MAESTRO — project notes

Browser-based virtual orchestra conducted with webcam hand tracking. Fully client-side; no backend, no paid services, no API keys.

## Commands
| | |
|---|---|
| `npm ci` | install from the lockfile (a `postinstall` copies the MediaPipe WASM into `public/`) |
| `npm run dev` / `npm run preview` | dev server (5173) / production preview (4173) |
| `npm run verify` | typecheck + lint + unit tests + production build |
| `npm test` / `npm run test:e2e` | Vitest / Playwright (Chromium; `npx playwright install chromium` once) |
| `npm run generate:midi` | regenerate `public/midi/*.mid` from `scripts/music` (deterministic) |

## Architecture — a decoupled pipeline (preserve)
`Webcam → MediaPipe (Web Worker) → landmark processing → gesture engine → conductor bridge → audio engine`

| Layer | Where | Notes |
|---|---|---|
| Camera | `src/vision/camera.ts` | `getUserMedia` only on a click; video only, never audio; releases tracks on stop |
| Detection | `vision/detector*.ts`, `detector.worker.ts` | `HandDetector` interface; worker (classic, IIFE) with main-thread fallback; one frame in flight |
| Landmarks | `vision/handPipeline.ts` | raw→display space, left/right resolution, One-Euro smoothing, kinematics, loss handling |
| Gestures | `src/gesture/**` | **pure TS, no DOM/React**: stroke segmenter → pattern tracker → tempo estimator; dynamics tracker; cue detector; `GestureEngine` |
| Bridge | `conducting/conductorBridge.ts` | the only place gesture events become audio commands; cues are state-validated |
| Audio | `src/audio/**` | **pure core** (Score, Sequencer, Mixer, dynamics, engine) behind an `AudioBackend`; `ToneBackend` is the only Web Audio code |
| Session | `conducting/conductingSession.ts` | owns every lifecycle; `activate()/deactivate()` (StrictMode-safe); records performances |
| UI | `src/pages`, `src/components` | reads stores; per-frame data never goes through React state |

## Decisions worth knowing
- **Tempo-following, not stretching.** The sequencer integrates a glided tempo into *beat position* (exponential glide + hard slew limit) and hands notes to the backend at the audio times their beats fall. Pitch = MIDI number only. **No phase correction, no position jumps** (user decision). Tempo = conductor BPM × composer's own tempo map ratio. Look-ahead 120 ms; backend queues notes and only sounds them within 70 ms so `silence()` can cancel.
- **Beat detection is trajectory-based**, never screen-position thresholds: strokes are segmented by velocity and direction (stops *and* corners), the ictus is the point of greatest progress (or turn onset), a pattern state machine (2/4, 3/4, 4/4) decides which beat a stroke is (handles one missed beat, re-syncs on a strong downbeat). Tempo needs ≥4 in-order beats with regular intervals before it moves (defence against random waving; measured ≈10 false tempo events per 240 s of vigorous random movement vs 72 without).
- **Cues are never suppressed during conducting**; safety = hold time + both hands still + confidence + transport-state validation + latch. Space pauses, Esc stops, always.
- **Handedness is validated, not assumed** (calibration against the mirrored preview). The detector gets the raw frame (mirroring inverts labels — verified); everything downstream is in display space.
- **Privacy is enforced, not promised:** `<meta>` CSP + CSP *headers* on dev/preview (for the worker script) + an egress guard inside the worker. MediaPipe tries to POST ~140 B of usage telemetry to `odml.pa.googleapis.com`; it is blocked (a CSP console message is expected). A test asserts no external requests.
- **Tone.js is imported lazily inside `ToneBackend.init()`** (after a click): importing it creates a global AudioContext. `setContext(ctx, true)` disposes that default; `dispose()` closes ours. A Playwright test asserts every AudioContext is closed after leaving the Studio.
- **Web Worker was justified by measurement** (CPU delegate, music playing): main thread ~97% busy, UI ~12 fps, 17 notes dropped/60 s → worker: 0–2 long tasks, UI 60 fps, no dropped notes. Production builds use a *classic* worker (MediaPipe's loader needs `importScripts`); Vite dev serves module workers only, so dev falls back to the main thread (logged).
- **GPU→CPU auto-downgrade** if the GPU delegate is slow (>400 ms after 3 frames or >80 ms after 15; software GL).
- **Output level:** make-up gain + limiter + tanh soft clipper → ≤ −0.3 dBFS even with master at max (measured pp −31 / mf −20 / ff −12 dB RMS).
- **Analytics honesty:** every metric is `measured`, `estimate` (derived from the recogniser, not ground truth) or `unavailable` (null). No hands tracked ⇒ nulls, never "perfect". Demo (synthetic) sessions are labelled and excluded from conducting averages. No sample data anywhere.
- **Music:** three original compositions (4/4, 3/4, 2/4) generated to real `.mid` files and parsed by the same MIDI parser any file would use. Track→section mapping: override > drum channel > GM program > name > strings. Bach/Vivaldi/Handel are `planned`: no verified-licence arrangement could be obtained (the build environment could not reach Mutopia/Wikimedia).

## Conventions
- Path alias `@/` → `src/`. Tailwind v3 tokens in `tailwind.config.js` (ink / ivory / gold / bronze). Serif Cormorant Garamond + Inter (Google Fonts, system fallback).
- All tunables: `src/config/gestureConfig.ts` (defaults) + persisted overrides (`settings.ts`) + the Studio's **Tuning** panel (`config/tuning.ts`). Don't hard-code thresholds.
- Every visible control must work or state why it is disabled. Neutral/measured/estimate/unavailable tags live in `StatusTag`/`MetricCard`.
- Compositions: add to `src/library/compositions.ts`; `available` requires a MIDI file **and** a licence entry in `LICENSES.md` (a test enforces the shape).
- Vitest aliases `react-router` to its ESM build (dual-package context bug otherwise). TypeScript is 6.0 (typescript-eslint supports ≤6.0).

## Known limitations
- **Nothing has been verified on a physical webcam.** Gesture thresholds were tuned on synthetic trajectories (through the real vision pipeline); real hands will differ. Use the Tuning panel and `TESTING.md`.
- Hand-detection throughput is limited by MediaPipe (≈10–12 fps on the sandbox CPU delegate; far higher with a real GPU). Beat timing is therefore quantised to the detection rate; tempo-following does not need phase accuracy, but very fast conducting (>150 BPM) on slow hardware will be less reliable.
- The tempo estimate lags a real tempo change by ~3–5 beats by design (outlier rejection + capped steps).
- Open-palm pause is experimental and off by default.
- Beat pattern for 4/4 is MAESTRO's simplified educational pattern (down, left, right, up), not a traditional one.
- Audio quality is synthesised (no sample library); good but not a recording. Notes already sounding at pause are not resumed mid-note.
- Single camera (browser default); no device picker. Prioritises Chromium; Firefox/Safari untested. Dev server runs MediaPipe on the main thread (worker fallback).
- `npm audit` 0 vulnerabilities (a `minimatch` override is pinned for the lint toolchain).
