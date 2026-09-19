/**
 * RB Assistant — Electron main (focusless lecture overlay).
 *
 * Inspired by cheating-daddy window patterns as rationale only (no code copied,
 * GPL respected): TOPMOST screen-saver level + visibleOnFullScreen, showInactive
 * never focus, click-through toggle, globalShortcut keyboard-only control,
 * desktopCapturer silent grab, sidecar extraResource binary.
 *
 * Why each choice (lecture fullscreen case):
 * - `alwaysOnTop screen-saver + visibleOnFullScreen`: paints above Chrome
 *   Fullscreen API where a div cannot.
 * - `focusable:false + showInactive()`: lecture never fires blur/visibilitychange,
 *   video never pauses.
 * - `setIgnoreMouseEvents(true, forward)`: view-only default; Ctrl+M enables
 *   10s interact for scroll/copy then auto back.
 * - `desktopCapturer` in main (not Python mss): faster in-memory PNG, no roundtrip.
 *   Hide 120ms before grab so overlay is not in its own screenshot (fixes
 *   self-capture loop seen in /history).
 */

const {
  app,
  BrowserWindow,
  globalShortcut,
  desktopCapturer,
  ipcMain,
  screen,
  Tray,
  Menu,
  net,
} = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
// Testable seams (Batch 1 extraction): capture/sidecar logic unit-tested via
// node --test without booting Electron. main.cjs stays thin wiring only.
const { grabScreenPNG: grabPNG, postAnalyze: postPNG } = require("./capture.cjs");
const { resolveExePath, pollBackend } = require("./sidecar.cjs");

let win = null;
let sidecar = null;
let tray = null;
let clickThrough = true;
let dragTimer = null; // stored (not fire-and-forget) so Esc cancels immediately
let compactMode = false;
let lastBounds = null;

const BACKEND_PORT = process.env.RB_BACKEND_PORT || "8000";
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

function createWindow() {
  win = new BrowserWindow({
    width: 680,
    height: 600,
    minWidth: 380,
    minHeight: 340,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    focusable: false, // never steal lecture focus
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, // secure (ref used false — we do true)
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    backgroundColor: "#00000000",
  });

  // Stealth chrome: above fullscreen lecture, hidden from share + taskbar.
  win.setAlwaysOnTop(true, "screen-saver", 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  try {
    win.setSkipTaskbar(true);
  } catch {}
  try {
    win.setContentProtection(true);
  } catch {}
  setClickThrough(true);

  // Dev: Vite http://localhost:8080. Prod: static renderer (see RUNBOOK static SPA note).
  // TanStack Start nitro SSR (.output/) cannot load via file:// — prod must switch to
  // static SPA dist/index.html. Interim packaged path below points at nitro public
  // output so dev packaging at least boots; replace with dist/ on static export.
  const devURL = process.env.RB_RENDERER_URL || "http://localhost:8080";
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    win.loadURL(devURL);
  } else {
    win.loadFile(path.join(__dirname, "../.output/public/index.html"));
  }
  win.showInactive(); // never focus lecture away

  // Hardening trio (MED-5): block nav/popups so compromised renderer can't escape.
  win.webContents.on("will-navigate", (e, url) => {
    if (
      !url.startsWith("http://localhost:") &&
      !url.startsWith("http://127.0.0.1:") &&
      !url.startsWith("app://")
    ) {
      e.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

function setupTray() {
  try {
    const iconPath = path.join(__dirname, "icon.ico");
    const fs = require("node:fs");
    if (!fs.existsSync(iconPath)) return; // real .ico lands in Batch 3 (PNG renders blank on Win tray)
    const { nativeImage } = require("electron");
    tray = new Tray(nativeImage.createFromPath(iconPath));
    tray.setToolTip("RB Assistant");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show", click: () => win?.showInactive() },
        {
          label: "Clickable: OFF",
          click: () => setClickThrough(!clickThrough),
        },
        { type: "separator" },
        { label: "Quit (stops backend)", click: () => app.quit() },
      ]),
    );
    tray.on("click", () => (win?.isVisible() ? win.hide() : win?.showInactive()));
  } catch (e) {
    console.warn("[tray] disabled:", e.message);
  }
}

function setClickThrough(enabled) {
  clickThrough = enabled;
  try {
    if (enabled) win.setIgnoreMouseEvents(true, { forward: true });
    else win.setIgnoreMouseEvents(false);
  } catch {}
  win?.webContents.send("rb:click-through", clickThrough);
}

/** Spawn frozen FastAPI sidecar (PyInstaller rb-server.exe). Dev: skip if already running. */
function startSidecar() {
  if (process.env.RB_NO_SIDECAR === "1") return;
  const exe = resolveExePath({
    resourcesPath: process.resourcesPath,
    dirname: __dirname,
    platform: process.platform,
  });
  const fs = require("node:fs");
  if (!fs.existsSync(exe)) {
    console.log("[sidecar] no bundle found, expecting dev `uv run fastapi dev` on", BACKEND_URL);
    return;
  }
  sidecar = spawn(exe, ["--port", BACKEND_PORT], {
    env: { ...process.env },
    stdio: "ignore",
    windowsHide: true,
  });
  sidecar.on("error", (e) => console.error("[sidecar] spawn failed:", e.message));
}

/** Hide -> grab -> show via testable seam (try/finally lives in capture.cjs). */
async function grabScreenPNG() {
  return grabPNG({
    hide: () => win.hide(),
    show: () => win.showInactive(),
    getSources: (opts) => desktopCapturer.getSources(opts),
    primarySize: screen.getPrimaryDisplay().size,
    delayMs: 120,
  });
}

async function postAnalyze(pngBuffer) {
  // Multipart to /analyze (guarded by X-RB-Client). net.fetch = Chromium networking (proxy-friendly).
  const fetchFn = net?.fetch ? net.fetch.bind(net) : fetch;
  return postPNG({ fetchFn, backendURL: BACKEND_URL, clientTag: "electron" }, pngBuffer);
}

/** Poll GET / until sidecar ready (fixes first-hotkey connection-refused race). */
async function waitForBackend() {
  const fetchFn = net?.fetch ? net.fetch.bind(net) : fetch;
  return pollBackend(fetchFn, BACKEND_URL, 20, 500);
}

function clearDragTimer() {
  if (dragTimer) {
    clearTimeout(dragTimer);
    dragTimer = null;
  }
}

async function handleCapture() {
  try {
    win.webContents.send("rb:status", { status: "capturing" });
    const png = await grabScreenPNG();
    win.webContents.send("rb:status", { status: "answering", kb: Math.round(png.length / 1024) });
    const answer = await postAnalyze(png);
    win.webContents.send("rb:answer", { answer });
  } catch (e) {
    win.webContents.send("rb:answer-error", { message: e.message || "Capture failed." });
  }
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  // Full auto (focusless, primary).
  globalShortcut.register("Shift+Space", () => void handleCapture());
  // Drag snip mode: renderer opens selector overlay (needs temporary interact).
  // Timer handle stored so Esc (rb:drag-cancel) restores click-through immediately.
  globalShortcut.register("Ctrl+Shift+Space", () => {
    setClickThrough(false);
    win.webContents.send("rb:drag-mode", { on: true });
    clearDragTimer();
    dragTimer = setTimeout(() => {
      setClickThrough(true);
      dragTimer = null;
    }, 30_000);
  });
  globalShortcut.register("Ctrl+M", () => setClickThrough(!clickThrough));
  globalShortcut.register("Ctrl+\\", () => {
    if (win.isVisible()) win.hide();
    else win.showInactive();
  });
  // Move without mouse (keeps lecture focus).
  const step = 60;
  const move = (dx, dy) => {
    if (!win.isVisible()) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  };
  globalShortcut.register("Ctrl+Up", () => move(0, -step));
  globalShortcut.register("Ctrl+Down", () => move(0, step));
  globalShortcut.register("Ctrl+Left", () => move(-step, 0));
  globalShortcut.register("Ctrl+Right", () => move(step, 0));
}

app.whenReady().then(async () => {
  // Single instance: second launch quits (fixes port-conflict double spawn).
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", () => win?.showInactive());
  // Trigger OS screen permission prompt early (macOS).
  desktopCapturer.getSources({ types: ["screen"] }).catch(() => {});
  startSidecar();
  createWindow();
  setupTray();
  // Don't block window on cold sidecar: poll in background, report status.
  void waitForBackend().then((ok) => {
    if (!ok)
      win?.webContents.send("rb:answer-error", {
        message: "Backend not starting — running `uv run fastapi dev`?",
      });
  });
  registerShortcuts();

  ipcMain.handle("rb:capture", () => handleCapture());
  // Explicit interactive set (toggle pill) — VIEW=false(click-through) / MOVE=true.
  ipcMain.handle("rb:set-interactive", (_e, interactive) => {
    setClickThrough(!interactive);
    return !clickThrough;
  });
  ipcMain.handle("rb:resize", (_e, w, h) => {
    // Sync native window to React S/M/L + grip (fixes div-vs-window desync + footer cut).
    try {
      const [x, y] = win.getPosition();
      win.setSize(Math.round(w) + 32, Math.round(h) + 32); // +chrome margin for rounded corners
      win.setPosition(x, y);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("rb:minimize", () => {
    // Minimize = hide to tray (skipTaskbar: taskbar minimize breaks focusless).
    win.hide();
    return true;
  });
  ipcMain.handle("rb:toggle-compact", () => {
    // Maximize box = Compact (header+answer ~220px) ↔ last full size. Native maximize
    // would cover the lecture — neverFullscreen by design.
    try {
      if (!compactMode) {
        lastBounds = win.getBounds();
        win.setSize(lastBounds.width, 240);
        compactMode = true;
      } else if (lastBounds) {
        win.setSize(lastBounds.width, lastBounds.height);
        compactMode = false;
      }
      return compactMode;
    } catch {
      return compactMode;
    }
  });
  ipcMain.handle("rb:hide", () => {
    // X = hide only (not quit) to avoid accidental mid-lecture kill. Tray Quit stops app.
    win.hide();
    return true;
  });
  ipcMain.handle("rb:drag-cancel", () => {
    clearDragTimer();
    win.webContents.send("rb:drag-mode", { on: false });
    setClickThrough(true);
    return true;
  });
  ipcMain.handle("rb:toggle-click-through", () => {
    setClickThrough(!clickThrough);
    return clickThrough;
  });
  ipcMain.handle("rb:quit", () => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  try {
    sidecar?.kill();
  } catch {}
});
