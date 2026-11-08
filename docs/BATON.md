# Baton tracking — feasibility decision

**Decision: MAESTRO does not track the baton tip. It tracks the hand that holds it. The baton is taught in the Academy.**

## What was considered
| Approach | Verdict |
|---|---|
| Colour marker on the tip (HSV threshold + blob centroid) | Cheap (< 1 ms/frame on a 160×120 downscale) and the most plausible option. But it depends on lighting colour temperature, white balance, auto-exposure, skin tones, clothing and background; a neon marker can be matched by a poster or a shirt. It needs a per-user calibration of the hue/saturation range and a fallback when it is lost. |
| Shape detection of the stick | A thin, low-contrast, motion-blurred line against arbitrary backgrounds, partly hidden by the fist. Not reliable with a webcam at 30 fps. |
| Learned detector for the stick | Needs a labelled data set of batons in real rooms; none exists here, and shipping a second model would add download and CPU cost to the tracking loop. |
| Extrapolating the tip from hand landmarks | A baton held in a fist is not visible in the landmarks; a guessed tip would be a fabricated measurement. |

## Why it is not shipped
The brief says not to ship unreliable baton detection. Reliability of any of the above can only be established with **real cameras, in real rooms, with real batons**, and this build environment has none: every tracking test here is synthetic (landmarks drawn by `DemoSource`, or the Chromium fake capture device). A colour tracker that passes synthetic tests proves nothing about a living-room webcam, so adding one would be advertising a feature that has not been verified.

## What works today
* A baton in the right hand is fine: the hand tracker follows the fist, and the beat logic (`strokeSegmenter` → `patternTracker`) uses the palm centre, so beats and tempo are detected as with a bare hand. **Not verified with a real baton**: a stick can change how MediaPipe sees the hand.
* The Academy has three baton lessons (what/why/grip, preparation–rebound–character, communicating with the sections), each with an interactive demonstration and a quiz.

## If you want to add it later
1. Record 20–30 min of real conducting with a baton under 3–4 lighting conditions and 2–3 cameras; keep it locally (never upload it).
2. Prototype a marker tracker in a worker next to the hand detector (shares the frame); output a `BatonFrame { tip, confidence }` and feed it to `StrokeSegmenter` in place of the palm when confidence is high.
3. Gate it behind a calibration step (hold the marker in view; capture hue/saturation/value ranges; show the mask), a visible detection overlay and an automatic fall-back to the hand.
4. Measure: detection rate, false-positive rate on marker-coloured objects, tip jitter versus the hand, and the beat-timing difference against hand tracking.
