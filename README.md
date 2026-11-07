# MAESTRO — Conduct Your Own Orchestra

Browser-based virtual orchestra controlled by webcam hand tracking. It runs entirely in the browser: no backend, no paid services, and camera frames never leave your machine.

> **Status: Phase 2 of 7.** The interface plus webcam capture, MediaPipe hand tracking (both hands, 21-point skeleton), left/right calibration and a demonstration mode are implemented. Gestures, tempo/dynamics and audio are **not implemented yet**; their controls are disabled and labelled. Camera behaviour has **not yet been verified on a physical webcam** (see `TESTING.md`). Details: `CLAUDE.md`.

## Run locally (Linux)

**Requirements:** Git, and Node.js **22.22.2 or newer** (npm is included). Check with `node -v`.
If your distribution's Node is older, install a current one with [nvm](https://github.com/nvm-sh/nvm) (`nvm install 22` — an `.nvmrc` is provided, so `nvm install` / `nvm use` also works).

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

Then open <http://localhost:5173>, go to **Studio**, and press **Enable camera** (the browser will ask permission; it is never requested before). `npm ci` installs the exact versions in `package-lock.json` (`npm install` also works) and, via a `postinstall` script, copies the MediaPipe WASM runtime into `public/`; the hand model itself is committed in the repo, so no extra download is needed.

No camera? Use **Demo mode** in the Studio (synthetic hands, clearly labelled).

## Other commands

| Command | Purpose |
|---|---|
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build at <http://localhost:4173> |
| `npm run test:e2e` | Playwright end-to-end checks (first run: `npx playwright install chromium`) |

The app uses client-side routing. If you host `dist/` on a static server, configure it to serve `index.html` for unknown paths, or deep links such as `/studio` will 404.

**Privacy:** camera frames are processed locally in the browser and never uploaded. A Content-Security-Policy restricts which hosts the page may contact; it also blocks MediaPipe's built-in usage-logging requests, which shows up as one expected console message (details in `TESTING.md`).

Fonts (Cormorant Garamond, Inter) load from Google Fonts; offline, the app falls back to system fonts.

## Project documents
- `CLAUDE.md` — architecture decisions, conventions, known limitations
- `LICENSES.md` — licence record for every asset
- `TESTING.md` — automated coverage and the manual checklist for your laptop
