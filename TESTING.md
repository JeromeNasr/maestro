# Testing MAESTRO

## What is automated (and what it does NOT prove)

| Layer | Command | Covers |
|---|---|---|
| Unit / component (Vitest, jsdom) | `npm test` | Pure vision pipeline, calibration, tracking-loss handling, camera lifecycle (with fake streams), overlay drawing, session state machine, Studio UI flows, privacy policy (CSP) |
| End-to-end (Playwright, Chromium) | `npm run test:e2e` | Built app with the **real MediaPipe model and WASM**, driven through the real `getUserMedia` API using Chromium's **fake capture device** |
| Types / build | `npm run typecheck`, `npm run build` | |

First e2e run on a machine: `npx playwright install chromium`.
Optional hand-detection e2e: `MAESTRO_FAKE_HAND_VIDEO=/path/to/clip.y4m npm run test:e2e -- --project=fake-camera-with-hands`
(a clip showing hands; none is committed because no hand footage with a verified licence is included).

**None of this is a physical webcam test.** A fake device plays a synthetic pattern or a video file; it cannot show how
detection behaves with your camera, lighting, distance, skin tone, GPU, or real conducting motion. Everything under
"Manual test on your laptop" below must be done by a person.

## Manual test on your laptop (Linux, Chrome/Chromium recommended; also try Firefox)

Setup: `npm ci && npm run dev`, open <http://localhost:5173/studio>. Open DevTools (F12) → Console and Network.

1. **No camera on load.** Load the page. No permission prompt, no camera light, Network shows no camera activity. ☐
2. **Enable camera.** Click *Enable camera* → browser prompt → Allow. Expect: "Waiting for camera permission…" → "Loading hand-tracking model…" → *Live camera*; your mirrored image appears. ☐
3. **Hands + skeleton.** Show both hands. Expect a 21-point skeleton on each hand that sticks to your real hand (check fingertips), labelled LEFT/RIGHT with a %. Move your hand to the right of the screen: it must move right on screen (mirror view). ☐
4. **Handedness (important).** Before calibrating, status says *Not verified*. Raise your RIGHT hand alone. Note which label the app shows and where it is on screen. Then press **Calibrate** and follow the 3 steps. Record the result card ("matched" or "reversed") and whether the labels are right afterwards. Reload the page: it should say *Verified by calibration*. *Clear calibration* removes it. ☐
5. **Tracking loss.** Lower a hand out of view: the label shows *Signal lost · holding…* (≤ 0.3 s, skeleton dimmed) then *Not detected*. Raise it again: it recovers without a jump. ☐
6. **Performance.** Read the line "N fps · N ms inference · GPU/CPU". Note the numbers and whether the page stays responsive (try scrolling). If GPU is slow (> 80 ms) the app switches to CPU once and says so. Target to report: ≥ 20 fps and a responsive UI. ☐
7. **Sensitivity.** Move the slider down/up; detection should get stricter/looser (hands partly out of frame). ☐
8. **Camera release.** Click *Stop camera*: camera light turns off immediately. Enable again, then navigate to another page: light turns off. Enable again and close the tab: light turns off. ☐
9. **Denied permission.** In the browser's site settings set Camera to *Block*, reload, Enable camera. Expect the "Camera access was blocked" message with instructions. Allow it again → *Try again* works. ☐
10. **Camera busy / missing.** Start the camera in another app (or tab) and try again → "Camera is unavailable" message. If you can, unplug a USB webcam while running → "Camera disconnected". ☐
11. **Background tab.** Switch to another tab: status shows *Paused (tab hidden)* and CPU drops; switching back resumes. ☐
12. **Demo mode.** With the camera stopped, click *Demo mode*: two synthetic hands labelled "Demonstration — synthetic hands" move; Calibrate is disabled. ☐
13. **Privacy.** With the camera running, the Network tab should show no requests after the model loads. One red Console message *"Refused to connect to https://odml.pa.googleapis.com/v1/log … Content Security Policy"* is **expected**: MediaPipe tries to send a ~140-byte usage log and MAESTRO's CSP blocks it. ☐
14. **Conditions.** Repeat 3–5 with dim light, a busy background, and at ~0.5 m and ~1.5 m distance. Note where it fails. ☐

Please report: browser + version, camera model, CPU/GPU, the numbers from step 6, the step-4 handedness outcome, and anything that failed.
