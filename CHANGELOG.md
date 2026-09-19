# Changelog — RB Assistant (rb-client)

This file tracks every functional change, so devs know what changed, why, and how it was verified.
Format: newest entry on top. Each entry lists files, behavior, tests, and next step.

## 2026-09-19 — True transparent overlay (no glass, floating text only)

### Why (your table)
- Native `transparent:true/frame:false/backgroundColor #00000000` was already correct;
  all white came from renderer CSS (`.rb-window` 0.94 + blur, chrome 0.88, body 0.75,
  footer 0.9, Ghost/Glass/Solid modes, `.rb-desktop` gradient). S/M/L + VIEW/MOVE +
  capture logic untouched.

### Changed
- `client/src/styles.css`: `.rb-window/.rb-chrome/.rb-body/.rb-footer` → transparent,
  no blur/borders/shadow; `.rb-specular` hidden (white band); `.rb-desktop` → transparent
  (no fake gradient); removed all `rb-opacity-*` blocks; added `rb-answer-text/title`
  (white + heavy black shadow, reads over VS Code white and dark code). Small controls
  (buttons/pills/logo/kbd/status) keep chip backgrounds — only large surfaces cleared.
- `client/src/components/RBAssistantWindow.tsx`: removed `opacity` state, `cycleOpacity()`,
  `rb-opacity-*` class, Ghost/Glass/Solid emoji button (also kills emoji footprint);
  title + answer/error use `rb-answer-title/text`; root keeps `rb-interactive` glow only.
- Untouched per table: `electron/main.cjs`, `preload.cjs`, `capture.cjs`,
  `DragSelector.tsx`, `router.tsx`, `routeTree.gen.ts`.

### Verified (mocked, zero quota)
- `tsc` clean; `lint` clean; `vitest` 7 passed; `build` ok; `node --check` 4 ok;
  `node --test` 5 passed; `pytest` 35 passed.

### You verify (1 live optional within your 5)
- Overlay over VS Code: no white rectangle, lecture/code visible behind, floating
  header + answer text readable via shadow. VIEW/MOVE + capture unchanged.
- NOTE: `localhost:8080` shows browser default behind (transparent body); true
  see-through desktop only renders in `electron:dev` shell.

## 2026-09-19 — Dark-layer fix: transparent html/body/#root (your research)

### Why
- After large surfaces went transparent, a dark rectangle remained: `body` still painted
  `var(--color-background)` (dark oklch) full-viewport over the transparent native window.

### Changed
- `client/src/styles.css`: `html, body, #root → transparent !important` (body keeps
  color/font, drops bg); `!important` on all transparent surfaces + `-webkit-backdrop-filter`
  safety prefixes.
- `client/src/components/RBAssistantWindow.tsx`: deleted `rb-specular` div (CSS hide
  was equivalent; deletion is cleaner).

### Verified (mocked, zero quota)
- `tsc` clean; `lint` clean; `vitest` 7 passed; `build` ok; `pytest` 35 passed.

## 2026-09-19 — Audit fix: pixel-cap guard in read_image (/analyze path)

### Why
- `MAX_IMAGE_PIXELS 50MP` guard lived only in `encode_png_bytes_to_data_url()`.
- `/analyze` flows through `load_image() -> read_image()`, which called `to_rgb()`
  (full RGB alloc) before `encode_*` ever ran — a crafted <15MB PNG decoding to
  >50MP allocated the huge buffer first. Guard was bypassed on that path.

### Changed
- `src/rb_client/images.py`: same `width*height > MAX_IMAGE_PIXELS` 400-check in
  `read_image()` after `load()`, before `to_rgb()` (mirrors `encode_*` wording).
- `tests/test_images.py`: new `test_read_image_rejects_decompression_bomb_dimensions`
  (mocked 10000x10000, no big alloc, no network).

### Verified (mocked, zero quota burned — 0 of 5 /analyze calls used)
- `uv run pytest` 35 passed (34 before + 1 new regression test).
- `uv run mypy src` clean.

## 2026-09-19 — Toggle VIEW/MOVE + Ghost transparency + Batch 2 reliability

### Why (your observations)
- Screen-share invisibility confirmed working (contentProtection) — kept.
- Opaque white blocked lecture; S/M/L + drag dead (click-through ignored mouse);
  presets resized div not native window (footer cut); chrome buttons dead; no tray.

### Changed
- `electron/main.cjs`: `rb:set-interactive`, `rb:resize` (native setSize), `rb:minimize` (hide to
  tray), `rb:toggle-compact` (Compact 240px ↔ full, never native maximize), `rb:hide` (X=hide),
  single-instance lock, background `pollBackend` via `sidecar.cjs`, `net.fetch`, hardening
  (`will-navigate` origin gate + `setWindowOpenHandler deny`), tray Show/Quit (needs real .ico in Batch 3).
- `electron/preload.cjs`: `setInteractive/resize/minimize/toggleCompact/hide/cancelDrag` exposed.
- `electron/capture.cjs`: unchanged contract (try/finally); `sidecar.cjs`: `pollBackend` + tests.
- `RBAssistantWindow.tsx`: VIEW/MOVE pill + `Ctrl+M`, `interactive` from `onClickThrough`,
  header `WebkitAppRegion:drag` only in MOVE, S/M/L + grip sync native via `rb:resize`,
  Ghost/Glass/Solid opacity toggle (Ghost default), chrome wired (min=hide, box=compact, X=hide),
  `DESKTOP` badge kept. Exit = tray Quit / Ctrl+Q (X never quits by design).
- `styles.css`: `rb-opacity-ghost/glass` alphas (fixed descendant selector bug → self prefix),
  `rb-interactive` glow.
- `images.py`: `MAX_IMAGE_PIXELS 50MP` guard before `to_rgb` (decompression bomb).
- `types/electron.d.ts`: new IPC signatures.

### Verified (mocked, zero quota)
- `node --check` 4 ok; `node --test` 5 passed; `pytest` 34 passed (incl. pixel-cap mock);
  `mypy` clean; `tsc` clean; `lint` clean; `vitest` 7 passed; `build` ok.

### You verify (needs your screen)
- Ghost default shows lecture behind; pill flips VIEW→MOVE (glow, draggable header, buttons live);
  S/M/L resizes native window (footer reachable); `_` hides to tray, `□` compacts, `X` hides,
  tray Quit stops app+sidecar. 1 live capture optional within your 5.

## 2026-09-19 — Audit verify: 5 gaps fixed (build mode)

### Fixed (missed in prior pass)
- `app.py`: `/analyze-screen` now uses `mime` var (was hardcoded `image/png`).
- `DragSelector.tsx`: pointerup computes rect from release event (was stale state → quick drag never confirmed).
- `electron.d.ts`: removed duplicate `export type` re-export; `bridge.ts` holds runtime `hasBridge()`.
- `preload.js` + `RBAssistantWindow.tsx`: IPC `on*` return unsubscribe, cleanup on unmount (StrictMode-safe).
- `main.js` prod path + `electron-builder.yml`: point at `.output/public` interim, document static SPA TODO (was nonexistent `dist/`).

### Verified (mocked, zero quota)
- `uv run pytest` 30 passed; `uv run mypy src` clean; `bunx tsc` clean; `bun run lint` clean;
  `vitest` 6 passed; `bun run build` ok.

## 2026-09-19 — Finish runnable Electron dev (renderer IPC + drag stub + runbook)

### Changed
- `client/src/types/electron.d.ts` (new): `window.rb` bridge types + `hasBridge()`.
- `client/src/components/RBAssistantWindow.tsx`: uses `window.rb.capture()` + `onStatus/onAnswer`
  in Electron, web fetch fallback otherwise; `DESKTOP` badge, `dragMode` state.
- `client/src/components/DragSelector.tsx` (new): dim + drag rect + Enter/Esc (V1 confirms to
  full grab, crop TODO Phase 3 to avoid extra quota burns now).
- `client/electron/RUNBOOK.md` (new): 3-terminal dev verify, static SPA blocker note, sidecar/key plan.
- Kept `/analyze-screen` for web dev (secured with header); Electron main POSTs `/analyze`
  (stable contract, `/analyze-screen` deleted at packaging).

### Verified (mocked, zero quota)
- `uv run pytest`, `bunx tsc --noEmit`, `bun run lint`, `vitest`, `bun run build` (see below).

### How to verify (you run)
- `uv run fastapi dev` + `cd client; bun run dev` + `RB_NO_SIDECAR=1 bun run electron:dev`
- YouTube fullscreen → Shift+Space → overlay answers, video unpaused. 1 live call only if you approve.

## 2026-09-19 — Phase 2 Electron scaffold + secure sidecar (build mode)

### Why
- Web trigger is DOM-only (fails on tab switch) and self-captures own overlay (all /history
  previews describe RB window). Lecture needs OS-level TOPMOST + global hotkey + hide-before-grab.
- `POST /analyze-screen` no-body = blind CSRF quota burn; `app://*` CORS never matches (exact-match).
- Packaged app rewrites capture in Electron main (faster in-memory PNG) — agreed.

### Changed
- `src/rb_client/openrouter.py`: hardened `VISION_PROMPT` (ignore RB window, answer only,
  `NO_QUESTION` sentinel) + `NO_QUESTION` const. Fixes unprofessional template output.
- `client/src/lib/analyze.ts`: `NO_QUESTION/MESSAGE`, `X-RB-Client: web` header (forces preflight).
- `client/src/components/RBAssistantWindow.tsx`: `captureMeta` (`Grabbing…/Captured ✓`),
  `NO_QUESTION` friendly text, removed dead Abort branch (#4), aria-live kept.
- `src/rb_client/images.py`: new `encode_png_bytes_to_data_url()` shared by both endpoints (#3).
- `src/rb_client/app.py`: `allow_origin_regex ^app://.*` (#2), `X-RB-Client` 403 guard on
  `/analyze-screen` (#1), uses shared encoder, unused imports removed, trailing newline fixed (#5).
- `src/rb_client/__main__.py` (new): frozen sidecar entry `uvicorn app --port` for Electron spawn.
- `client/electron/main.js` (new): frameless transparent focusless TOPMOST screen-saver,
  `showInactive`, click-through toggle, globalShortcut (Shift+Space full, Ctrl+Shift+Space drag,
  Ctrl+M, Ctrl+\, arrows), hide-120ms `desktopCapturer` grab → POST `/analyze` with
  `X-RB-Client: electron`, sidecar spawn/kill. Comments explain why (inspired, not copied).
- `client/electron/preload.js` (new): secure `contextBridge window.rb` only.
- `client/electron-builder.yml` (new): nsis + portable targets, sidecar extraResource, SPA note.
- `client/package.json`: `test`, `electron:dev`, `electron:build` scripts; `electron`,
  `electron-builder`, `vitest` devDeps.
- `tests/test_analyze_screen.py`: 403 without header, prompt asserts, grab-500 kept.
- `client/src/lib/analyze.test.ts`: NO_QUESTION contract (6 tests total).

### Verified (mocked, zero quota burned)
- `uv run pytest` 30 passed; `bunx tsc --noEmit` clean; `bun run lint` clean;
  `bunx vitest run` 6 passed; `bun run build` ok.
- Manual TODO: `RB_NO_SIDECAR=1 bun run electron:dev` over YouTube fullscreen → hotkey answers,
  video unpaused, no self in shot.

### Next
- Static SPA export for `file://` (nitro SSR incompatible), drag-selector overlay UI,
  safeStorage key prompt, final installer vs portable pick.

## 2026-09-19 — Phase 1 Connect: real Capture + Copy buttons

### Why
- `RBAssistantWindow` used mock `simulateRecapture()` + hardcoded answer. Lecture use-case needs
  real `screenshot -> POST :8000/analyze -> answer` without stealing focus from browser fullscreen.
- `copyAnswer` never wrote to clipboard.
- Browser `getDisplayMedia` picker would steal focus and pause lecture, so backend does the
  server-side `mss` grab on same machine (fast for dev). Electron will later replace this with
  in-process `desktopCapturer` (faster, no Python grab) — see note below.

### Changed
- `src/rb_client/screen.py` (new): `capture_screenshot() -> bytes` moved out of `capture.py` for reuse.
  Single source for dev hotkey client + new server endpoint. Commented for Electron handoff.
- `src/rb_client/app.py`: added `CORSMiddleware` (web dev `localhost:8080` + future `app://`) and
  `POST /analyze-screen` (no body, server-side grab -> vision). Kept `POST /analyze` intact.
- `src/rb_client/capture.py`: now imports from `screen.py` (no logic change).
- `client/src/lib/analyze.ts` (new): `postScreenCapture()` + `postImageBlob()`, timeout/abort,
  401/429/504 mapping, `VITE_BACKEND_URL` support. JSDoc + focusless notes.
- `client/src/components/RBAssistantWindow.tsx`: real state machine
  `idle|capturing|ready|error`, `AbortController` + 2s cooldown (matches backend), real
  `navigator.clipboard.writeText` with fallback, `aria-live` answer, timeout cleanup.
- `tests/test_analyze_screen.py` (new): mocked screen grab + `call_openrouter` for `/analyze-screen`.
- `client/src/lib/analyze.test.ts` (new, vitest 4 passed): `toUserMessage` 401/429/0/passthrough.
  Added `vitest` devDep for future component tests.

### Inspiration (not copied, GPL-3.0 respected)
- `sohzm/cheating-daddy` ideas reused as rationale only: `alwaysOnTop screen-saver` +
  `visibleOnFullScreen`, `showInactive()` never `focus()`, click-through toggle,
  `globalShortcut` keyboard-only control, `desktopCapturer` silent grab, sidecar
  `extraResource` binary pattern. No code pasted.

### Electron note (agreed)
- Packaged app will rewrite capture in Electron main (`desktopCapturer` in-memory PNG -> POST
  sidecar) because it is faster than Python `mss` roundtrip. `screen.py` stays for dev only.

### Verified
- `uv run pytest` — 28 passed incl. new screen endpoint
- `bunx tsc --noEmit` clean, `bun run lint` clean, `bunx vitest run` 4 passed, `bun run build` ok
- Manual TODO: YouTube fullscreen -> Shift+Space answers, video does not pause

### Next
- Phase 2 Electron shell: frameless transparent focusless TOPMOST + globalShortcut +
  `desktopCapturer` capture + sidecar spawn + static SPA export (current nitro SSR won't load via file://).
