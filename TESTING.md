# MAESTRO — testing

## 1. Automated coverage

| Command | What it runs |
|---|---|
| `npm test` | Vitest, 39 files / 543 tests: gesture engine (stroke segmenter, pattern tracker 2/4·3/4·4/4, tempo estimator, dynamics, cues, tracking loss/recovery, false gestures) on synthetic landmark trajectories; MIDI parsing, section mapping, sequencer scheduling and tempo glide, mixer mute/solo, dynamics, audio lifecycle; session recorder, analytics, Academy progress; camera errors/cleanup; Studio UI. |
| `npm run test:e2e` | Playwright (Chromium, fake capture device): 27 specs in the `fake-camera` project — pages, navigation, camera permission flow, calibration, Studio, audio init, demo playback, tempo affects scheduled events, dynamics change level, mute/solo, stop releases AudioContexts, sessions saved, analytics real, axe accessibility, privacy (no external requests), UI frame-rate guard. |
| `MAESTRO_FAKE_HAND_VIDEO=<y4m> npm run test:e2e` | Optional extra project: real MediaPipe detection on a hand video through the worker. The hand video is not committed (see `LICENSES.md`). |
| `npm run verify` | typecheck + lint + unit tests + production build. |

What automated tests **cannot** show: that gesture thresholds suit real hands, real-camera lighting/latency, real handedness labels, or how the audio sounds on your speakers. Everything below needs a person with a webcam.

## 2. Physical webcam checklist (nothing here has been verified on a physical camera)

Use Chromium or Chrome, `npm run build && npm run preview`, open http://localhost:4173. Good light, hands visible, plain background.

1. **Permission only on click.** Load the Studio: no permission prompt appears. Click *Enable camera* → prompt appears. Deny it → a clear message and a working *Retry*. Allow it.
2. **Camera light/release.** Leave the Studio (or press Stop camera): the camera light turns off.
3. **Preview is mirrored.** Raise your right hand; it appears on the right of the preview (like a mirror).
4. **Calibration / handedness.** Run calibration as prompted (raise the hand asked for). Outcome should say whether labels were swapped; confirm the skeleton colours/labels match the hand you raise. If it is wrong, set handedness manually in settings.
5. **Landmarks.** 21 points per hand, both hands tracked, skeleton follows without large lag. Note FPS, delegate (GPU/CPU) and worker/main-thread in the diagnostics. Dev server uses main thread; preview/production uses the worker.
6. **Tracking loss.** Drop your hands out of frame: status shows lost; music holds tempo and does not crash. Re-enter: tracking recovers.
7. **Conducting, 4/4.** Pick *Aurora Étude*, start (Start gesture or button). Beat with the right hand (down, left, right, up). The beat indicator should follow your strokes. Try ~60, ~90, ~120 BPM.
8. **3/4 and 2/4.** *Evening Minuet* (down, right, up) and *Parade March* (down, up).
9. **Tempo following.** Speed up/slow down gradually: playback follows after ~3–5 beats, smoothly, with no jumps in position and unchanged pitch.
10. **Random waving.** Wave erratically: tempo should barely move.
11. **Dynamics.** Make the beat bigger/smaller (or raise/lower the dynamics hand): level and brightness change; crescendo/diminuendo are smooth.
12. **Cues.** Hold both hands still with the stop/pause pose for the configured time: transport pauses/stops. Quick incidental poses during conducting must not trigger. Space pauses, Esc stops.
13. **Tab hidden.** Switch tabs and return: no stuck notes or runaway tempo.
14. **Tuning panel.** Adjust sensitivity/thresholds if beats are missed or spurious; note the values that work.
15. **Mixer.** Mute/solo sections; volumes respond; meters move.
16. **Sessions.** After a conducting session ≥5 s, Analytics lists it with measured vs estimate vs unavailable metrics; sessions with no tracked hands show unavailable, not "perfect".
17. **Privacy.** In DevTools → Network, no request leaves localhost apart from an optional font fetch; a CSP console message about `odml.pa.googleapis.com` (blocked MediaPipe telemetry) is expected.
18. **Audio.** Check loudness at master max (no clipping), instrument distinctness, no clicks on start/pause/stop.

Please record: browser/version, GPU/CPU delegate, FPS, handedness result, and any missed or false beats with your approximate BPM.

## 3. Added in the tracking / orchestra upgrade
Automated (all synthetic or fake-device — none of this is a physical-webcam result):
* `src/vision/handIdentity.test.ts`: right-only, left-only, both hands, MediaPipe-style inverted labels, 25–50 % label flicker, crossing hands with unreliable labels, short loss and return, edge exit/return, third hand, wrong default mapping (online learning), end-to-end conducting through the real pipeline.
* `src/gesture/gestureEngine.test.ts`: small-gesture adoption, tremor floor, false-positive guard.
* `src/audio/sampledBackend.test.ts`, `sampleBank.test.ts`, `instruments.test.ts`, `orchestraBackend.test.ts`: routing, re-pitching maths, loop parameters, voice release/cancel, load progress, fallback.
* `src/library/classics.test.ts`: every shipped classic parses, matches its provenance record, opens with the right notes (Beethoven G-G-G-E♭, Brandenburg horn fanfare, Spring theme, Nachtmusik figure), stays within each instrument's range, and follows tempo changes without changing pitch.
* `tests/e2e/audio.spec.ts`, `audio-perf.spec.ts`: real Chromium Web Audio — samples load (not the fallback), only same-origin audio requests, output peak ≤ 0.99 at maximum master/fortissimo, timpani audible, measured frame pacing and long tasks for samples vs synth.

Still needs a physical webcam (see section 2): right-hand identification with a real MediaPipe model (is the default `swap = true` right on your browser?), crossing hands, lighting changes, small-gesture adoption, a baton in the hand, and the real feel of latency.
Still needs ears: the instrument balance, the quality of the sustain loops, timpani tuning (derived by analysis, not by listening), the horn's register gap.
