# RB Assistant — Electron runbook (dev verify, no quota burn unless you approve 1 live)

## Dev run (uses dev backend, no packaging yet)

Terminal 1 — backend:

```
uv run fastapi dev
# serves http://127.0.0.1:8000, needs OPENROUTER_API_KEY in root .env
```

Terminal 2 — web renderer:

```
cd client
bun run dev
# serves http://localhost:8080
```

Terminal 3 — Electron shell (dev, loads localhost:8080):

```powershell
cd client
$env:RB_NO_SIDECAR="1"; bun run electron:dev
# PowerShell syntax (bash: RB_NO_SIDECAR=1 bun run electron:dev)
# expects dev backend on :8000 (RB_NO_SIDECAR skips frozen exe spawn)
```

## What to check (no live model call needed)

- Overlay floats over YouTube fullscreen, `DESKTOP` badge visible in header.
- `Shift+Space` (global, even with lecture focused) shows `Grabbing screen…`.
- `Ctrl+M` toggles click-through, `Ctrl+\` hides/shows, `Ctrl+Arrows` moves.
- `Ctrl+Shift+Space` opens drag selector; `Esc` cancels, drag+`Enter` falls back to full grab (crop TODO Phase 3).

## 1 live check (only if you approve quota, 43 left)

- Arrange single aptitude question behind overlay, `Shift+Space`, expect answer-only text.
- If `No question found`, re-arrange (proves NO_QUESTION path, not a bug).

## Static SPA note (packaging blocker, documented not yet built)

- Current `vite.config.ts` uses TanStack Start nitro SSR (`cloudflare-module`) — cannot load via `file://`.
- Prod Electron must load static `dist/index.html` with hash route. Keep Start for web dev.
- TODO Phase 3: add `vite.build` SPA config for Electron (`RB_RENDERER_STATIC=1`), keep nitro for web.

## Sidecar + key (packaging)

- Dev: root `.env` `OPENROUTER_API_KEY` (gitignored).
- Packaged: `src/rb_client/__main__.py` frozen to `dist-sidecar/rb-server.exe` via PyInstaller,
  spawned by `electron/main.js`, health-polled `GET /`. Key via Electron `safeStorage` prompt
  (TODO settings UI) injected as env, never baked into exe.
- Final step picks nsis installer vs portable (both stubbed in `electron-builder.yml`).
