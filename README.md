# MAESTRO — Conduct Your Own Orchestra

Conduct a virtual orchestra with your hands. Your **right hand** sets the tempo (beat patterns in 2/4, 3/4 and 4/4), your **left hand** shapes the dynamics (pp → ff), and a real orchestra — four synthesised sections playing real MIDI scores — follows you. It runs entirely in your browser: **no backend, no account, no API keys, and camera frames never leave your machine.**

## Install and run (Linux)

Requirements: Git and Node.js **22.22.2 or newer** (`node -v`). If your distribution's Node is older, use [nvm](https://github.com/nvm-sh/nvm): `nvm install` (an `.nvmrc` is provided).

```bash
git clone <repository-url> maestro
cd maestro
```

```bash
npm ci
```

```bash
npm run dev
```

Open <http://localhost:5173>, choose **Studio**, then:

1. **Enable camera** (the browser asks; nothing is requested before this) and, once, **Calibrate** — it verifies which hand is which against the mirrored preview and learns your range.
2. **Start** (a click is required by browsers to start audio).
3. Conduct. Right hand: down-left-right-up in 4/4 (down-right-up in 3/4, down-up in 2/4). Left hand: higher = louder.
4. Both hands raised and held still pauses/resumes; both lowered and held still stops. **Space** pauses, **Esc** stops, always.

No camera? **Virtual conductor** (synthetic hands, clearly labelled) drives the same recogniser so you can hear tempo and dynamics follow.

`npm ci` installs the exact versions in `package-lock.json` and, via `postinstall`, copies the MediaPipe WASM runtime into `public/` (the hand model is committed in the repo, so nothing else is downloaded).

## What's in it
- **Studio** — camera + skeleton overlay, live BPM/beat/dynamics, mixer with real output meters (volume, mute, solo per section), tempo mode (follow / fixed), conducting-in-two, Tuning panel, always-visible pause/stop, session summary.
- **Library** — three original playable pieces (Aurora Étude 4/4, Evening Minuet 3/4, Parade March 2/4). Bach, Vivaldi and Handel are listed as planned: no verified-licence arrangement could be obtained.
- **Academy** — 11 lessons with quizzes, a tap-tempo exercise and camera exercises judged by the real recogniser. Progress counts only what you did.
- **Analytics** — saved sessions with every figure marked *measured*, *estimate* or *unavailable*; export as JSON.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` / `npm run preview` | dev server (5173) / serve the production build (4173) |
| `npm run verify` | typecheck + lint + unit tests + production build |
| `npm test` | Vitest (543 tests) |
| `npm run test:e2e` | Playwright in Chromium (first time: `npx playwright install chromium`) |
| `npm run generate:midi` | regenerate the original compositions' `.mid` files |

## Privacy and network
Camera frames are processed locally (in a Web Worker) and never uploaded. The only network requests are the page's own files and the Google Fonts stylesheet. A Content-Security-Policy and an egress guard in the worker block everything else — including MediaPipe's built-in usage-logging request, which shows up as one expected console message. If you host the production build, send the same CSP as a **response header** (see `vite.config.ts`) so it also covers the worker, and serve `index.html` for unknown paths (client-side routing).

## Documents
`CLAUDE.md` architecture & decisions · `TESTING.md` automated coverage and the **physical-testing checklist** · `LICENSES.md` every asset's licence.
