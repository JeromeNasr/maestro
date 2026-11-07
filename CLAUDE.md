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

## Status
- Phase 1 (frontend foundation) complete: Landing, Library (search + persisted selection), Studio layout, Academy (animated pattern demos, dynamics demo), Analytics layout (empty state + labelled sample preview).
- Not implemented yet: camera/MediaPipe (P2), gesture engine (P3), audio/MIDI/orchestra (P4), integration (P5), analytics recording + camera exercises (P6), e2e/hardening (P7).

## Known limitations
- Gesture config defaults are untuned guesses; real tuning requires local webcam testing by the project owner.
- The demo composition's MIDI file does not exist yet (generated in Phase 4). The Bach/Vivaldi/Handel pieces are listed as `planned` until verified-licence arrangements are added.
- Web fonts load from Google Fonts at runtime (not self-hosted).
- Cloud environment cannot verify real webcam behaviour.
