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
| Audio | `src/audio/**` | **pure core** (Score, Sequencer, Mixer, dynamics, engine, instrument assignment, sample selection) behind an `AudioBackend`. `SampledBackend` (raw Web Audio, recorded orchestra) is the default; `ToneBackend` (synth) is only an explicit fallback; `OrchestraBackend` chooses and reports which |
| Session | `conducting/conductingSession.ts` | owns every lifecycle; `activate()/deactivate()` (StrictMode-safe); records performances |
| UI | `src/pages`, `src/components` | reads stores; per-frame data never goes through React state |

## Decisions worth knowing
- **Tempo-following, not stretching.** The sequencer integrates a glided tempo into *beat position* (exponential glide + hard slew limit) and hands notes to the backend at the audio times their beats fall. Pitch = MIDI number only. **No phase correction, no position jumps** (user decision). Tempo = conductor BPM × composer's own tempo map ratio. Look-ahead 120 ms; backend queues notes and only sounds them within 70 ms so `silence()` can cancel.
- **Beat detection is trajectory-based**, never screen-position thresholds: strokes are segmented by velocity and direction (stops *and* corners), the ictus is the point of greatest progress (or turn onset), a pattern state machine (2/4, 3/4, 4/4) decides which beat a stroke is (handles one missed beat, re-syncs on a strong downbeat). Tempo needs ≥4 in-order beats with regular intervals before it moves (defence against random waving; measured ≈10 false tempo events per 240 s of vigorous random movement vs 72 without).
- **Cues are never suppressed during conducting**; safety = hold time + both hands still + confidence + transport-state validation + latch. Space pauses, Esc stops, always.
- **Handedness (root cause of the "right hand doesn't work" bug).** The detector gets the RAW frame and MediaPipe assumes a MIRRORED one, so its labels are inverted (documented by MediaPipe: swap for un-mirrored input). The old default applied no swap until calibration, and the synthetic demo used non-inverted labels, so tests never saw it: uncalibrated, the user's right hand was routed to the dynamics slot. Now: default `swap = true` (unverified, flagged), `DemoSource` emits MediaPipe-realistic inverted labels (+ optional flicker), and **identity is a track, not a per-frame label** (`vision/handIdentity.ts`): palm-position continuity with velocity prediction (hand-size-scaled gate), a running label vote that only re-assigns a lone hand after ~10 consistent, position-agreeing frames, a position prior for new hands, elimination when the other hand is known, 900 ms track memory (edge exits, crossing), and an online learner that flips the label mapping if two separated hands keep contradicting it. Calibration still measures the mapping against the mirrored preview and overrides the default. Everything downstream is in display space.
- **Small gestures are adopted automatically** (`GestureEngine.adaptiveThresholds`): when the last 4 strokes are similar in size (≤ 2.2×) and evenly spaced (CV ≤ 0.35) the amplitude/speed thresholds relax to 80 % of the smallest, with a hard floor at 30 % of the default. Measured on synthetic trajectories: 40–60 %-size conducting went from 0–11 of 45 beats to 40–41 of 45. Cost, measured: small random waving 0 → 2 false tempo events per 6 × 60 s (large random waving ≈ 19–20 either way).
- **MediaPipe confidences are split** (`confidenceTriplet`): detection = c, presence = 0.85c, tracking = 0.6c, so a motion-blurred stroke stays on the cheap tracking path instead of re-running palm detection. Rationale only — not measured on a real camera.
- **Privacy is enforced, not promised:** `<meta>` CSP + CSP *headers* on dev/preview (for the worker script) + an egress guard inside the worker. MediaPipe tries to POST ~140 B of usage telemetry to `odml.pa.googleapis.com`; it is blocked (a CSP console message is expected). A test asserts no external requests.
- **Recorded orchestra** (`SampledBackend`): VSCO-2 Community Edition (CC0) samples built by `scripts/samples/build-samples.mjs` from a pinned commit into `public/samples` (149 Opus files, 4.3 MB: violins, violas, cellos, basses, flute, oboe, clarinet, bassoon, horn, trumpet, trombone, tuba, timpani, bass drum, snare, cymbals, triangle). Sustained instruments carry a baked crossfade loop and are re-pitched by playback rate from the nearest recorded pitch (no time-stretching, so tempo never alters pitch); each sample's measured pitch is corrected in cents at build time. Percussion are one-shots with velocity layers (timpani: nearest of 5 drums). Only the instruments a piece uses are fetched (Cache API, versioned by a content hash) and decoded (Beethoven 5: 123 files, 66 MB decoded). Chain: instrument pan → section low-pass+gain (mixer × dynamics) → master → gate → make-up → limiter → tanh clipper; convolution hall send per section. Violins II reuse the violin recordings (+4¢). If the library is missing the app falls back — visibly — to the Tone synth (`OrchestraBackend`). **Tone.js is imported lazily only for that fallback** (`ToneBackend.init()`; it creates a global AudioContext on import, `setContext(ctx, true)` disposes it). A Playwright test asserts every AudioContext is closed after leaving the Studio.
- **Instruments vs families.** Mixer, dynamics and gestures still use the four families. Each note also carries an `instrument` (`audio/instruments.ts`): track name > GM program > register; combined desks ("Cellos & Basses") are split per note by register; GM drum notes map to bass drum/snare/cymbals/triangle.
- **Web Worker was justified by measurement** (CPU delegate, music playing): main thread ~97% busy, UI ~12 fps, 17 notes dropped/60 s → worker: 0–2 long tasks, UI 60 fps, no dropped notes. Production builds use a *classic* worker (MediaPipe's loader needs `importScripts`); Vite dev serves module workers only, so dev falls back to the main thread (logged).
- **GPU→CPU auto-downgrade** if the GPU delegate is slow (>400 ms after 3 frames or >80 ms after 15; software GL).
- **Output level:** make-up gain + limiter + tanh soft clipper → ≤ −0.3 dBFS even with master at max (measured pp −31 / mf −20 / ff −12 dB RMS).
- **Analytics honesty:** every metric is `measured`, `estimate` (derived from the recogniser, not ground truth) or `unavailable` (null). No hands tracked ⇒ nulls, never "perfect". Demo (synthetic) sessions are labelled and excluded from conducting averages. No sample data anywhere.
- **Music:** three original compositions (4/4, 3/4, 2/4; `npm run generate:midi`) and five **real classics rendered from Mutopia Project LilyPond sources** by `scripts/music/build-classics.mjs` (pinned commit; per-piece licence read from the source header; provenance in `public/midi/classics.json`): Beethoven 5/I (PD), Mozart K.525 I & II (PD), Vivaldi Spring I (CC BY-SA 3.0), Bach Brandenburg 1/I (CC BY 3.0). Brandenburg 3 and Water Music are `planned`: not in that source tree, and IMSLP/archive.org/Wikimedia/MuseScore are blocked from the build environment. Needs LilyPond ≥ 2.24 only to rebuild. Default first piece is `DEFAULT_COMPOSITION_ID` (Aurora Étude). Track→section mapping: override > drum channel > GM program > name > strings.
- **Baton:** deliberately not tracked (see `docs/BATON.md`); the Academy teaches it (3 lessons with interactive demos).

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
- Audio is sampled but not a full orchestra recording: only violins/violas/cellos are section recordings, everything else is a SOLO instrument (a section is approximated by detuned copies); one velocity layer for sustained instruments (loudness = gain + brightness filter); looping hides but does not remove the sustain's character; the horn has a 14-semitone gap in its sampled range (74–77 re-pitched across ≥ 7 semitones). **The mix balance has been checked by measurement only (output peaks / meters), not by ear.** Safari/older browsers need Opus-in-Ogg support (untested). Notes already sounding at pause are not resumed mid-note.
- Decoded samples cost memory (Beethoven 5: 66 MB); low-end phones may struggle.
- The classics are typeset-score renderings: flat-ish dynamics (the conductor supplies them), no tempo rubato from the source, Mozart III/IV and Vivaldi II/III are not shipped, reference tempos are editorial.
- Single camera (browser default); no device picker. Prioritises Chromium; Firefox/Safari untested. Dev server runs MediaPipe on the main thread (worker fallback).
- `npm audit` 0 vulnerabilities (a `minimatch` override is pinned for the lint toolchain).
