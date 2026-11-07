# MAESTRO — project notes

Browser-based virtual orchestra conducted with webcam hand tracking. Fully client-side; no backend, no paid services.

## Commands
- `npm run dev` — dev server · `npm run build` — typecheck + production build · `npm test` — Vitest · `npm run typecheck`

## Architecture (decided in Phase 0 — preserve)
Pipeline of independent modules, pure TypeScript cores, React only for presentation:
`vision (camera, MediaPipe, filter) → gesture (beat, tempo, dynamics, cues) → conducting (bridge/session) → audio (sequencer, orchestra)`.
- Per-frame data must never flow through React state; a `ConductingSession` class (not a component) owns the rAF loop and all disposables (camera tracks, landmarker, Tone nodes, listeners).
- Tempo sync = smoothed tempo-following of `Tone.Transport` BPM. **No aggressive phase correction or position jumps.** Pitch is preserved by scheduling MIDI in musical time (never stretching audio).
- Stop / pause cues stay active during conducting; accidental triggers are prevented with hold durations, confidence thresholds and gesture-state validation — never by suppressing all cues.
- MediaPipe handedness must be validated against the mirrored preview during calibration before any left/right swap is applied (`tracking.handednessMode: 'auto'`).
- All thresholds live in `src/config/gestureConfig.ts` (defaults) and `src/config/settings.ts` (persisted overrides). Do not hard-code tunables elsewhere.

## Conventions
- Path alias `@/` → `src/`. Tailwind v3; design tokens in `tailwind.config.js` (ink/ivory/gold/bronze), fonts Cormorant Garamond + Inter (Google Fonts link; falls back to system serif/sans offline).
- Honesty rules: unimplemented features are rendered disabled and tagged with `<PhaseTag>`; demo data is tagged `<StatusTag kind="demo">`; live values show "—" until real data exists. Analytics distinguish `measured` vs `estimate`.
- Compositions: add an entry to `src/library/compositions.ts`. A piece may be `available` only with a MIDI file **and** a documented licence in `LICENSES.md`.

## Phase 2 decisions (camera + MediaPipe) — preserve
- **Pipeline** (`src/vision`, all pure TS except camera/detector): `CameraController` → `HandDetector` (MediaPipe, behind an interface) → `HandPipeline` (raw→display space, left/right resolution, One-Euro smoothing, kinematics, `TrackingMonitor`) → `HandFrame`. `VisionSession` owns every lifecycle (camera tracks, detector, rAF loop, visibility listener, settings subscription, calibration) and is created/disposed by `useVisionSession` in the Studio. React reads `session.store` (≈10 Hz) and the canvas subscribes via `onFrame`; **no per-frame React state**.
- **Coordinate spaces:** the detector gets the raw un-mirrored frame (mirroring it inverts labels — verified empirically); everything after the pipeline is in *display space* (x mirrored) so "right side of the preview = the user's right". The `<video>` is CSS-mirrored; the overlay canvas is not.
- **Handedness:** never assumed. `handednessMode:'auto'` applies **no** correction until Calibrate has validated labels against the mirrored preview (the user places one hand on the matching side; we compare the reported label). Result is persisted (`calibrationStore`). Same-label-for-both-hands falls back to screen position. Manual override: "as-reported"/"swapped".
- **Camera permission** is requested only by `startCamera()` (user click). Video only, never audio. Camera/detector are released on stop, navigation, unmount, tab-hidden pause (processing only), track-ended, model failure, detection exception. Start/stop races are guarded by generation counters.
- **Tracking loss:** missing hand is held (dimmed, "held") for `lossGraceMs` (300 ms), then dropped and its filters/kinematics reset.
- **Assets:** model self-hosted at `public/models/hand_landmarker.task` (committed); WASM copied from node_modules to `public/mediapipe/wasm` by `scripts/setup-mediapipe-assets.mjs` (npm `postinstall`, gitignored). Runtime falls back to CDNs only if local files are missing.
- **Delegate:** GPU first, CPU fallback at creation; plus one-shot automatic downgrade GPU→CPU if mean inference > 80 ms after 15 frames (software GL / weak iGPU). Observed in the cloud sandbox: GPU(software) 600–2100 ms/frame → CPU 56 ms.
- **Privacy enforcement:** CSP `connect-src` in `index.html` allows only self, dev websocket, and the two CDN fallbacks. This **blocks MediaPipe's built-in usage-logging POSTs** to `odml.pa.googleapis.com/v1/log` (observed: ~140 B protobuf containing the library version; no image data). The resulting console CSP error is expected. A test asserts the policy.
- **Demo mode:** `DemoSource` produces synthetic hands through the same pipeline; always labelled; calibration disabled.
- Phase 2 does NOT implement gestures, beat/tempo/dynamics logic, or audio.

## Testing
`npm test` (Vitest) · `npm run test:e2e` (Playwright + Chromium fake camera; `npx playwright install chromium` once) · manual laptop checklist in `TESTING.md`. Vitest aliases `react-router` to its ESM build (dual-package context bug otherwise).

## Status
- Phase 1 complete (UI foundation). React Router 7.18.5 (npm audit: 0 vulnerabilities).
- Phase 2 complete in code and automated tests: webcam permission handling, MediaPipe hand tracking (both hands, 21 landmarks, skeleton overlay), handedness validation + calibration, tracking confidence/loss handling, lifecycle/cleanup, demo mode. **Not yet verified on a physical webcam** — see `TESTING.md`.
- Not implemented yet: gesture engine (P3), audio/MIDI/orchestra (P4), integration (P5), analytics recording + camera exercises (P6), hardening (P7).

## Known limitations
- Gesture config defaults are untuned guesses; real tuning requires local webcam testing by the project owner. Phase 2 changed the One-Euro defaults (`filterMinCutoff` 1.5, `filterBeta` 4) for normalised coordinates; also untuned on real footage.
- Real-camera behaviour (accuracy, lighting, GPU speed, handedness on your camera) is unverified; only a fake capture device was used.
- Detection runs on the main thread (CPU delegate ≈ 56 ms/frame in the sandbox). A Web Worker is the escape hatch if the UI stutters on real hardware.
- One camera device (browser default); no device picker yet. Inference at the display's rAF rate with duplicate-frame skipping (no `requestVideoFrameCallback`).
- The demo composition's MIDI file does not exist yet (generated in Phase 4). The Bach/Vivaldi/Handel pieces are listed as `planned` until verified-licence arrangements are added.
- Web fonts load from Google Fonts at runtime (not self-hosted).
- Cloud environment cannot verify real webcam behaviour.
