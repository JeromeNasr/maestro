# MAESTRO — Conduct Your Own Orchestra

Browser-based virtual orchestra controlled by webcam hand tracking. It runs entirely in the browser: no backend, no paid services, and camera frames never leave your machine.

> **Status: Phase 1 of 7.** The interface (landing, library, studio layout, academy, analytics layout) exists. Camera, hand tracking, gestures and audio are **not implemented yet**; their controls are disabled and labelled. See `CLAUDE.md`.

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

Then open <http://localhost:5173>. (`npm ci` installs the exact versions in `package-lock.json`; `npm install` also works.)

## Other commands

| Command | Purpose |
|---|---|
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build at <http://localhost:4173> |

The app uses client-side routing. If you host `dist/` on a static server, configure it to serve `index.html` for unknown paths, or deep links such as `/studio` will 404.

Fonts (Cormorant Garamond, Inter) load from Google Fonts; offline, the app falls back to system fonts.

## Project documents
- `CLAUDE.md` — architecture decisions, conventions, known limitations
- `LICENSES.md` — licence record for every asset
