import { useEffect, useRef, useState } from "react";

/**
 * Drag-selector overlay stub for Electron `Ctrl+Shift+Space` (precise mode).
 * V1: fullscreen dim + drag rect + Enter confirm / Esc cancel. On confirm we
 * delegate to full grab (crop lands in Phase 3) to keep lecture interaction
 * minimal and avoid extra quota burns during scaffold.
 */
export function DragSelector({
  onSelect,
  onCancel,
}: {
  onSelect: (rect: { x: number; y: number; w: number; h: number }) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onCancel();
      if (e.code === "Enter" && rect) onSelect(rect);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onSelect, rect]);

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 cursor-crosshair bg-black/40"
      onPointerDown={(e) => {
        setStart({ x: e.clientX, y: e.clientY });
        setRect(null);
      }}
      onPointerMove={(e) => {
        if (!start) return;
        setRect({
          x: Math.min(start.x, e.clientX),
          y: Math.min(start.y, e.clientY),
          w: Math.abs(e.clientX - start.x),
          h: Math.abs(e.clientY - start.y),
        });
      }}
      onPointerUp={(e) => {
        // Compute from start + release event (not stale `rect` state) so quick
        // drag-release still confirms. State lags one render behind pointer.
        if (!start) return;
        const w = Math.abs(e.clientX - start.x);
        const h = Math.abs(e.clientY - start.y);
        if (w > 10 && h > 10) {
          onSelect({
            x: Math.min(start.x, e.clientX),
            y: Math.min(start.y, e.clientY),
            w,
            h,
          });
        }
      }}
    >
      <div className="absolute left-4 top-4 rounded bg-black/70 px-3 py-1 text-[12px] text-white">
        Drag to select question — Enter confirms, Esc cancels
      </div>
      {rect && (
        <div
          className="absolute border-2 border-accent bg-white/10"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        />
      )}
    </div>
  );
}
