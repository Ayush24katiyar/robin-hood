import { useCallback, useEffect, useRef, useState } from "react";

type Preset = "S" | "M" | "L";

const PRESETS: Record<Preset, { width: number; height: number }> = {
  S: { width: 460, height: 490 },
  M: { width: 680, height: 600 },
  L: { width: 920, height: 640 },
};

export function RBAssistantWindow() {
  const [preset, setPreset] = useState<Preset>("M");
  const [size, setSize] = useState(PRESETS.M);
  const [animate, setAnimate] = useState(true);
  const [copyLabel, setCopyLabel] = useState("Copy Answer");
  const [captureLabel, setCaptureLabel] = useState("New Capture");
  const resizing = useRef<null | {
    x: number;
    y: number;
    w: number;
    h: number;
  }>(null);

  const applyPreset = useCallback((p: Preset) => {
    setAnimate(true);
    setPreset(p);
    setSize(PRESETS[p]);
  }, []);

  const simulateRecapture = useCallback(() => {
    setCaptureLabel("Capturing...");
    setTimeout(() => setCaptureLabel("New Capture"), 900);
  }, []);

  const copyAnswer = () => {
    setCopyLabel("Copied!");
    setTimeout(() => setCopyLabel("Copy Answer"), 1800);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.code === "Space") {
        e.preventDefault();
        simulateRecapture();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [simulateRecapture]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const start = resizing.current;
      if (!start) return;
      const width = Math.min(Math.max(start.w + (e.clientX - start.x), 380), 1100);
      const height = Math.min(Math.max(start.h + (e.clientY - start.y), 340), 900);
      setSize({ width, height });
      setPreset(width < 540 ? "S" : width > 820 ? "L" : "M");
    };
    const onUp = () => {
      if (resizing.current) {
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
  }, []);

  const padding = preset === "S" ? "px-4 py-4" : "px-7 py-6";
  const titleSize =
    preset === "S" ? "text-[15px]" : preset === "L" ? "text-[18px]" : "text-[17px]";

  return (
    <div
      className={`rb-window relative z-20 flex w-full select-none flex-col overflow-hidden rounded-2xl ${
        animate ? "rb-window-animate" : ""
      }`}
      style={{
        width: size.width,
        maxWidth: size.width,
        height: size.height,
        minWidth: 380,
        minHeight: 340,
      }}
    >
      <div className="rb-specular pointer-events-none absolute inset-x-0 top-0 h-28" />

      <header className="rb-chrome flex shrink-0 items-center justify-between gap-2 px-4 py-3 sm:px-5">
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
        </div>

        <div className="flex items-center space-x-2 overflow-hidden sm:space-x-3">
          <div className="rb-status hidden shrink-0 items-center space-x-2 rounded-full px-3 py-1 text-[11.5px] font-medium sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="rb-pulse absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="font-semibold tracking-tight text-success-foreground">
              Answer ready
            </span>
          </div>

          <div
            role="group"
            aria-label="Window size presets"
            className="rb-segment flex items-center rounded-lg p-0.5"
          >
            {(["S", "M", "L"] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
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
          <button type="button" title="Minimize" className="rb-chrome-btn">
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
            title="Toggle size"
            className="rb-chrome-btn"
            onClick={() => applyPreset(preset === "L" ? "M" : "L")}
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
          <button type="button" title="Close" className="rb-chrome-btn rb-chrome-btn-danger">
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

      <main
        className={`rb-body flex-1 space-y-5 overflow-y-auto text-[13.5px] leading-relaxed ${padding}`}
      >
        <div className="space-y-2">
          <h1
            className={`font-bold tracking-tight text-foreground ${titleSize}`}
            style={{ letterSpacing: "-0.015em" }}
          >
            Type Mismatch Fix for Float64Array
          </h1>
          <p className="text-[13.5px] leading-relaxed text-body">
            The compile error occurs because{" "}
            <code className="rb-code">payload.regionalWeights</code> is inferred as an
            untyped generic array rather than a numeric iterable compatible with TypedArray
            buffer initializers.
          </p>
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
        </div>

        <div className="flex items-center space-x-2">
          <button type="button" onClick={copyAnswer} className="rb-action">
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
            onClick={simulateRecapture}
            className="rb-action rb-action-primary"
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
    </div>
  );
}
