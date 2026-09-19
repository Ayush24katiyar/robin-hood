# IMPLEMENTATION NOTES — RB Assistant Batch 1 (boot-gated)

Purpose: record what changed, why, and what flaws to never repeat. Read before Batch 2/3.

## Batch 1 scope (gated on boot, multi-monitor dropped, max 5 quota for verify)
- P0 boot fix, High 1 hidden-forever, High 3 /analyze CSRF guard, drag-cancel timer,
  NO_QUESTION normalize, RUNBOOK PowerShell line.
- Out: multi-monitor (dropped per decision), tray/static/crop (Batch 3), poll+lock (Batch 2).

## What changed + why

### 1. P0: `electron/main.js` → `main.cjs`, `preload.js` → `preload.cjs`
- Why: `client/package.json` is `"type": "module"`, so `.js` loads as ESM. `require` +
  `__dirname` then throw `ReferenceError: require is not defined` and `electron:dev`
  crashes before window shows. `.cjs` forces CommonJS.
- Files: `client/electron/main.cjs:53` preload path, `package.json electron:dev`
  → `electron ./electron/main.cjs`. Builder `electron/**` glob already covers `.cjs`.
- Lesson: `tsc/lint/vitest` never touch `electron/*.cjs` — always run
  `node --check electron/*.cjs` + `node --test electron/capture.test.cjs` in verify.

### 2. Structural flaw fix: extracted `electron/capture.cjs` + `sidecar.cjs`
- Why: old `main.js` was a monolith (`require("electron")` + windows at import), so
  Vitest/node could not import or mock it. All prior "mocked" claims were impossible.
- Now: `grabScreenPNG(deps)` + `postAnalyze(deps, png)` take injected
  `{hide, show, getSources, fetchFn, backendURL}` — honestly tested via
  `node --test` with stub reject (asserts `finally show()`) and header assert.
- `sidecar.cjs` holds `resolveExePath()` now; poll+lock lands in Batch 2 on same seam.
- Lesson: never claim mocked Electron tests without a seam. Thin `main.cjs` wiring only.

### 3. High 1: try/finally show (was strand-hidden-forever)
- Old `grabScreenPNG` called `win.showInactive()` only after `await getSources`.
  Reject → overlay never returns (only `Ctrl+\` recovers).
- New `capture.cjs` wraps grab in `try{...}finally{show()}`. Test rejects `getSources`,
  asserts hide=1 show=1. Lesson: any hide-before-capture must be finally-guarded.

### 4. High 3: `POST /analyze` guard (was quota-burn hole)
- Wrong belief fixed: multipart/form-data IS CORS-safelisted (simple request), so no
  preflight — random sites could blind-fire `/analyze` like `/analyze-screen`.
- Now: both endpoints 403 without `X-RB-Client: web|electron|hotkey`.
  Same commit updated `capture.py post_image` header + existing tests to send header
  (else they 403-fail). `analyze.ts` already sent. Lesson: guard + callers + tests land together.

### 5. Drag-cancel timer (was 30s trap)
- Old `setTimeout(...30s)` anonymous — Esc could not clear, lecture clicks blocked.
- Now: `dragTimer` stored, `clearDragTimer()` on `rb:drag-cancel`, renderer `onCancel`
  invokes `window.rb.cancelDrag()`. Lesson: never fire-and-forget UI-blocking timers.

### 6. NO_QUESTION normalize (was exact-match leak)
- Old `trim() === "NO_QUESTION"` leaked `NO_QUESTION.` / newline / `Answer: NO_QUESTION`.
- Now: backend `normalize_answer()` regex `^\s*NO_QUESTION\b` (case-insensitive) in
  `call_openrouter`, frontend `isNoQuestion()` same regex. Tests cover variants both sides.

### 7. RUNBOOK PowerShell + prod path + IPC cleanup
- RUNBOOK used bash `RB_NO_SIDECAR=1 ...` — Windows needs `$env:RB_NO_SIDECAR="1";`.
- `main.cjs` prod `loadFile` pointed at nonexistent `dist/` — now interim
  `.output/public/index.html` with static-SPA TODO (Batch 3 spike, not assumed).
- `preload` `on*` now return unsubscribe; renderer cleans up (StrictMode-safe).

## Flaws to never repeat
1. No `.js` under `"type": "module"` for Electron boot files — use `.cjs` + `node --check`.
2. No mocked-Electron claims without an injected-deps seam (`capture.cjs` pattern).
3. No hide without finally-show. No blocking timer without stored handle + cancel IPC.
4. No new guarded endpoint without updating all callers + tests same commit.
5. No exact-match sentinels across network boundary — regex both sides.
6. No `electron-builder --dry-run` (does not exist) — use `--dir` in Batch 3.
7. No DIP→pixel assumption for crop (Batch 3): scale rect by `png.width/screenWidth` for 125/150%.
8. No placeholder tray PNG on Windows (needs real `.ico`) — budget tiny icon in Batch 3.
9. `X-RB-Client` is anti-CSRF (quota-burn), not auth — docs must say so.

## Verify (Batch 1, mocked, zero quota burned)
- `node --check electron/*.cjs` + `node --test electron/capture.test.cjs` (3 passed)
- `uv run pytest` 33 passed (incl. /analyze 403 + ok, normalize variants)
- `uv run mypy src` clean; `bunx tsc` clean; `bun run lint` clean;
  `vitest` 7 passed; `bun run build` ok.
- Boot gate for you: `uv run fastapi dev` + `cd client; bun run dev` +
  `$env:RB_NO_SIDECAR="1"; bun run electron:dev` → DESKTOP badge, Shift+Space shows
  Grabbing (0 quota until you approve live; max 5: 1 answer-only, 1 NO_QUESTION, 3 spare).
