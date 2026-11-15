# Baton tracking

**What exists:** an *experimental* Baton mode in the Studio that follows the baton **tip** by a **coloured marker** the user picks once, and lets the tip drive the beat. Without a marker nothing changes. The Academy also teaches the baton (grip, technique, sections).

## How it works
1. Put a vivid marker on the tip (tape, a sticker, a small ball): green, blue, pink or bright orange work; skin-like colours do not.
2. Studio → Baton → switch on → *Pick marker colour* → click the marker in the camera preview. The colour is sampled from **this camera in this room** (median of a 7×7 patch, as hue/saturation/value), so lamps and white balance are part of the calibration, not a problem to guess at. The panel warns if the pick is dull, dark, skin-like, or if more than 2 % of the picture already has that colour.
3. Every camera frame, a 320×240 copy is matched against the colour (hue within ±6°–22° by the *tolerance* slider, minimum saturation/brightness relative to the sample). The blobs of matching pixels are measured; one that is a plausible marker (between 0.008 % and 3 % of the frame, roughly round, not a line or an edge) and nearest to where the tip just was is the tip. No plausible blob = no answer (never a guess).
4. The tip is smoothed (One-Euro, tuned for fast motion), turned into a velocity, and fed to the same stroke/beat logic as the palm — in place of it while the tracker is confident (≥ 45 %). A stroke in progress is dropped at the switch, because the coordinates change. If the marker is lost, conducting falls back to the hand without losing the tempo.
5. *Show what it sees* paints the matched pixels over the preview, so a bad match (a green shirt, a plant) is visible at once.

Benefits, measured on synthetic data: the tip travels further than the palm (a lever arm), so small movements register that the hand alone misses (25 % size gestures: 1 beat from the hand vs 18 from the tip, of ~37); and the tip is still seen when a fist round the stick confuses the hand model (hands removed, baton only: beats and tempo within 2.5 BPM).

## What has and has not been verified
* **Verified (synthetic 320×240 frames, `src/vision/batonTracker.test.ts`):** position error < 1.5 px; four marker colours; lamp brightness ×0.55–×1.3 and warm/cool white balance; sensor noise; the skin-coloured hand patch; look-alike colours; two matching blobs (the one nearest the last position wins); huge areas and thin lines rejected; small, blurred, dim markers found; forgetting and re-finding; no marker = no answer.
* **Verified (engine, synthetic tip):** accurate beats/tempo, hand-lost/baton-kept, baton-lost/hand-kept, off switches.
* **NOT verified: any real camera, real marker, real room.** Real automatic exposure, motion blur at 30 fps, rolling shutter, a marker that turns away from the camera, glare on shiny tape, and other coloured objects in view will all matter. The tracker reports its confidence and match percentage so you can see how it is doing; please report what you find.

## Known limits
* A marker that is occluded by the fist or turned edge-on disappears; the hand takes over.
* Colour tracking is blind to a bare stick. This is deliberate: a thin, low-contrast, motion-blurred line is not reliably visible to a webcam.
* One marker, one camera; the tracker runs on the main thread (~1 ms per frame).

## If it does not work well
Pick a more vivid marker; add a larger one (a ball ≥ 2 cm); lower the tolerance if too much of the picture matches, raise it if the marker flickers; turn on *Show what it sees*; avoid shiny tape; keep the room lighting steady.
