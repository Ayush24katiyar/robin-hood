import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { NO_QUESTION_MESSAGE, isNoQuestion, postScreenCapture } from "@/lib/analyze";
import { hasBridge } from "@/lib/bridge";
import { DragSelector } from "@/components/DragSelector";

type Preset = "S" | "M" | "L";

/** Window size presets (S/M/L pills + toggle). Kept from original design. */
const PRESETS: Record<Preset, { width: number; height: number }> = {
  S: { width: 460, height: 490 },
  M: { width: 680, height: 600 },
  L: { width: 920, height: 640 },
};

/** Capture lifecycle for New Capture button + Shift+Space. */
type Status = "idle" | "capturing" | "ready" | "error";

/** Cooldown mirrors `COOLDOWN_SECONDS=2` in `capture.py` (avoid burst 429s). */
const CAPTURE_COOLDOWN_MS = 2000;

/** Transient label reset delays (UX only, timers cleaned up on unmount). */
const COPY_RESET_MS = 1800;

export function RBAssistantWindow() {
  const [preset, setPreset] = useState<Preset>("M");
  const [size, setSize] = useState(PRESETS.M);
  const [animate, setAnimate] = useState(true);

  // --- Real backend state (replaces old mock simulateRecapture) ---
  const [status, setStatus] = useState<Status>("idle");
  const [answer, setAnswer] = useState(
    "Press New Capture or Shift+Space to analyze the current screen.",
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [captureMeta, setCaptureMeta] = useState(""); // e.g. "Captured ✓"
  const [copyLabel, setCopyLabel] = useState("Copy Answer");
  const [dragMode, setDragMode] = useState(false); // Electron Ctrl+Shift+Space selector
  const [inElectron, setInElectron] = useState(false);
  const [interactive, setInteractive] = useState(false); // MOVE clickable vs VIEW click-through
  const abortRef = useRef<AbortController | null>(null);
  const lastCaptureRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const resizing = useRef<null | { x: number; y: number; w: number; h: number }>(null);

  // Track timers so unmount clears pending label resets (no setState leak).
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);
  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      abortRef.current?.abort();
    },
    [],
  );

  const applyPreset = useCallback((p: Preset) => {
    setAnimate(true);
    setPreset(p);
    setSize(PRESETS[p]);
  }, []);

  /**
   * New Capture: Electron IPC when available, else web POST /analyze-screen.
   * - Electron: main does hide-120ms desktopCapturer grab (faster, no self-capture),
   *   answer arrives via `rb:onAnswer`. No focus steal from lecture.
   * - Web: backend `mss` grab on same machine (dev only, DOM trigger).
   */
  const handleCapture = useCallback(async () => {
    // Cooldown: ignore rapid repeats (matches Python hotkey client).
    const now = Date.now();
    if (now - lastCaptureRef.current < CAPTURE_COOLDOWN_MS) return;
    lastCaptureRef.current = now;

    // Electron path: fire-and-forget, lifecycle via IPC events below.
    if (hasBridge()) {
      setStatus("capturing");
      setErrorMsg("");
      setCaptureMeta("Grabbing screen…");
      await window.rb?.capture();
      return;
    }

    // Cancel in-flight request before starting a new one.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("capturing");
    setErrorMsg("");
    setCaptureMeta("Grabbing screen…");
    try {
      const text = await postScreenCapture(ctrl.signal);
      // Answer-only UX: backend normalizes variants to NO_QUESTION sentinel.
      const clean = isNoQuestion(text) ? NO_QUESTION_MESSAGE : text;
      setAnswer(clean);
      setCaptureMeta("Captured ✓");
      setStatus("ready");
    } catch (err) {
      // fetchWithTimeout converts aborts to plain Error; outer abort = silent.
      if (ctrl.signal.aborted) return;
      setErrorMsg(err instanceof Error ? err.message : "Request failed.");
      setStatus("error");
    }
  }, []);

  /** Copy Answer: real clipboard write with execCommand fallback. */
  const copyAnswer = useCallback(async () => {
    const text = status === "ready" ? answer : "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API denied (permissions) — legacy fallback.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopyLabel("Copied!");
    later(() => setCopyLabel("Copy Answer"), COPY_RESET_MS);
  }, [answer, status, later]);

  /** VIEW/MOVE toggle: clickable pill + Ctrl+M. MOVE=interactive (drag/buttons work). */
  const flipInteractive = useCallback(async () => {
    const next = !interactive;
    setInteractive(next);
    if (hasBridge()) await window.rb?.setInteractive(next);
  }, [interactive]);

  /** Sync native window size (fixes div-vs-window desync + footer cut). */
  const syncNativeSize = useCallback((w: number, h: number) => {
    if (hasBridge()) void window.rb?.resize(w, h);
  }, []);

  // Global hotkeys: Shift+Space capture, Ctrl+M clickable toggle (web fallback).
  // In Electron these ALSO exist as main `globalShortcut` so lecture focus is untouched.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.code === "Space") {
        e.preventDefault();
        void handleCapture();
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyM") {
        e.preventDefault();
        void flipInteractive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCapture, flipInteractive]);

  // Electron IPC lifecycle: main drives capturing/answering so renderer stays dumb.
  // Web path uses handleCapture fetch above; Electron path resolves here.
  // Each subscription returns cleanup (StrictMode-safe, no double-fire).
  useEffect(() => {
    if (!hasBridge()) return;
    setInElectron(true);
    const offs = [
      window.rb?.onStatus((v) => {
        setStatus("capturing");
        setErrorMsg("");
        setCaptureMeta(
          v.status === "answering" && v.kb ? `Captured ${v.kb} KB ✓` : "Grabbing screen…",
        );
      }),
      window.rb?.onAnswer((v) => {
        const clean = isNoQuestion(v.answer) ? NO_QUESTION_MESSAGE : v.answer;
        setAnswer(clean);
        setCaptureMeta("Captured ✓");
        setStatus("ready");
      }),
      window.rb?.onAnswerError((v) => {
        setErrorMsg(v.message);
        setStatus("error");
      }),
      window.rb?.onDragMode((v) => setDragMode(v.on)),
      window.rb?.onClickThrough((clickThrough) => setInteractive(!clickThrough)),
    ];
    return () => offs.forEach((off) => off?.());
  }, []);

  const applyPresetWithSync = useCallback(
    (p: Preset) => {
      applyPreset(p);
      syncNativeSize(PRESETS[p].width, PRESETS[p].height);
    },
    [applyPreset, syncNativeSize],
  );

  // Free drag-resize from bottom-right grip + native window sync (fixes footer cut).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const start = resizing.current;
      if (!start) return;
      const width = Math.min(Math.max(start.w + (e.clientX - start.x), 380), 1100);
      const height = Math.min(Math.max(start.h + (e.clientY - start.y), 340), 900);
      setSize({ width, height });
      setPreset(width < 540 ? "S" : width > 820 ? "L" : "M");
    };
    const onUp = (e: PointerEvent) => {
      const start = resizing.current;
      if (start) {
        // Compute final from gesture (not stale `size` state) + sync native once.
        const width = Math.min(Math.max(start.w + (e.clientX - start.x), 380), 1100);
        const height = Math.min(Math.max(start.h + (e.clientY - start.y), 340), 900);
        if (hasBridge()) void window.rb?.resize(width, height);
        resizing.current = null;
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // size intentionally excluded: re-subscribing per pixel would reset gesture.
  }, []);

  const padding = preset === "S" ? "px-4 py-4" : "px-7 py-6";
  const titleSize = preset === "S" ? "text-[15px]" : preset === "L" ? "text-[18px]" : "text-[17px]";

  // Status pill + button labels derive from lifecycle (dev-readable).
  const capturing = status === "capturing";
  const statusText =
    status === "capturing"
      ? "Capturing…"
      : status === "ready"
        ? "Answer ready"
        : status === "error"
          ? "Failed — retry"
          : "Press capture";
  const captureLabel = capturing ? "Capturing..." : "New Capture";

  return (
    <div
      data-interactive={interactive}
      className={`rb-window relative z-20 flex w-full flex-col overflow-hidden rounded-2xl ${
        animate ? "rb-window-animate" : ""
      } ${interactive ? "rb-interactive" : ""}`}
      style={{
        width: size.width,
        maxWidth: size.width,
        height: size.height,
        minWidth: 380,
        minHeight: 340,
      }}
    >
      <header
        className="rb-chrome flex shrink-0 items-center justify-between gap-2 px-4 py-3 sm:px-5"
        // Native drag handle ONLY in MOVE mode (VIEW stays click-through for lecture).
        style={{ ["WebkitAppRegion" as string]: interactive ? "drag" : "no-drag" } as CSSProperties}
      >
        <div className="flex shrink-0 items-center space-x-2.5">
          <div className="rb-logo flex h-7 w-7 items-center justify-center rounded-xl">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
            </svg>
          </div>
          <span className="whitespace-nowrap text-[14px] font-bold tracking-tight text-foreground">
            RB Assistant
          </span>
          {inElectron && (
            <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-bold text-success-foreground">
              DESKTOP
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 overflow-hidden sm:space-x-3">
          {/* Live status: guides dev + user on capture lifecycle. */}
          <div className="rb-status hidden shrink-0 items-center space-x-2 rounded-full px-3 py-1 text-[11.5px] font-medium sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="rb-pulse absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="font-semibold tracking-tight text-success-foreground">
              {statusText}
            </span>
          </div>

          {/* VIEW/MOVE toggle pill: clickable (MOVE) ↔ click-through (VIEW). Ctrl+M same. */}
          <button
            type="button"
            title="Toggle clickable (Ctrl+M)"
            onClick={() => void flipInteractive()}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              interactive ? "rb-size-btn-active" : "font-medium text-muted-foreground"
            }`}
            style={{ ["WebkitAppRegion" as string]: "no-drag" } as CSSProperties}
          >
            {interactive ? "MOVE" : "VIEW"}
          </button>

          <div
            role="group"
            aria-label="Window size presets"
            className="rb-segment flex items-center rounded-lg p-0.5"
          >
            {(["S", "M", "L"] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPresetWithSync(p)}
                className={`rb-size-btn rounded-md px-2.5 py-0.5 text-[11px] ${
                  preset === p ? "rb-size-btn-active" : "font-medium text-muted-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center space-x-1 text-muted-foreground">
          <button
            type="button"
            title="Minimize to tray"
            className="rb-chrome-btn"
            onClick={() => void window.rb?.minimize()}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <line x1="5" x2="19" y1="12" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            title="Compact ↔ full (native maximize would cover lecture)"
            className="rb-chrome-btn"
            onClick={() => void window.rb?.toggleCompact()}
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <rect height="16" rx="2" width="16" x="4" y="4" />
            </svg>
          </button>
          <button
            type="button"
            title="Hide (tray Quit stops app)"
            className="rb-chrome-btn rb-chrome-btn-danger"
            onClick={() => void window.rb?.hide()}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <line x1="18" x2="6" y1="6" y2="18" />
              <line x1="6" x2="18" y1="6" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Answer region: aria-live so screen readers + devs see updates. */}
      <main
        aria-live="polite"
        className={`rb-body flex-1 space-y-5 overflow-y-auto text-[13.5px] leading-relaxed ${padding}`}
      >
        <div className="space-y-2">
          <h1
            className={`rb-answer-title font-bold tracking-tight ${titleSize}`}
            style={{ letterSpacing: "-0.015em" }}
          >
            {capturing ? "Analyzing screen…" : status === "error" ? "Capture failed" : "Answer"}
          </h1>
          {status === "error" ? (
            <p className="rb-answer-text text-[13.5px] leading-relaxed">{errorMsg}</p>
          ) : (
            <p className="rb-answer-text text-[13.5px] leading-relaxed whitespace-pre-wrap">
              {answer}
            </p>
          )}
        </div>
      </main>

      <footer className="rb-footer relative flex shrink-0 select-none items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center space-x-2">
          <div className="rb-kbd hidden items-center space-x-1 rounded px-2 py-0.5 font-mono text-[11px] font-medium xs:flex">
            <kbd className="font-semibold text-foreground">Shift</kbd>
            <span className="text-muted-foreground">+</span>
            <kbd className="font-semibold text-foreground">Space</kbd>
          </div>
          <span className="text-[12px] font-medium text-muted-foreground">
            {Math.round(size.width)} × {Math.round(size.height)}px
          </span>
          {captureMeta && (
            <span className="text-[11px] font-medium text-success-foreground">{captureMeta}</span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => void copyAnswer()}
            disabled={status !== "ready"}
            aria-disabled={status !== "ready"}
            className="rb-action disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{copyLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleCapture()}
            disabled={capturing}
            aria-disabled={capturing}
            className="rb-action rb-action-primary disabled:cursor-wait disabled:opacity-70"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{captureLabel}</span>
          </button>
        </div>

        <div
          title="Drag to resize freely"
          className="rb-grip absolute bottom-0 right-0 flex h-5 w-5 items-end justify-end p-1 text-muted-foreground"
          onPointerDown={(e) => {
            setAnimate(false);
            resizing.current = {
              x: e.clientX,
              y: e.clientY,
              w: size.width,
              h: size.height,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            document.body.style.cursor = "nwse-resize";
          }}
        >
          <svg
            className="pointer-events-none h-3.5 w-3.5 opacity-60"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <circle cx="14" cy="14" r="1.3" />
            <circle cx="10" cy="14" r="1.3" />
            <circle cx="14" cy="10" r="1.3" />
            <circle cx="6" cy="14" r="1.3" />
            <circle cx="10" cy="10" r="1.3" />
            <circle cx="14" cy="6" r="1.3" />
          </svg>
        </div>
      </footer>
      {dragMode && (
        <DragSelector
          onCancel={() => {
            // Esc: tell main to clear 30s timer + restore click-through immediately.
            void window.rb?.cancelDrag?.();
            setDragMode(false);
          }}
          onSelect={() => {
            // V1: drag confirms intent, main does full grab (crop in Phase 3).
            // Keeps lecture interaction minimal while precise-crop lands.
            setDragMode(false);
            void handleCapture();
          }}
        />
      )}
    </div>
  );
}
