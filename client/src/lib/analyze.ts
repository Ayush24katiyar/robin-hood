/**
 * Backend client for RB Assistant (web Phase 1).
 *
 * - `postScreenCapture()` hits `POST /analyze-screen` (no body). The backend
 *   grabs the screen via `mss` on the same Windows machine, so the fullscreen
 *   lecture never loses focus (browser picker would pause it).
 * - `postImageBlob()` hits `POST /analyze` with multipart `image` (dev fallback
 *   via file picker, or future Electron `desktopCapturer` PNG buffer).
 *
 * Electron note: packaged app will replace the grab with in-process
 * `desktopCapturer` (faster, no Python grab) but keep the same response shape
 * `{ response: string }` so this module stays compatible.
 */

/** Backend base URL. Set `VITE_BACKEND_URL` in `client/.env`, else localhost. */
export const BACKEND_URL =
  (import.meta.env["VITE_BACKEND_URL"] as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

/** Matches `ModelOutput` in `src/rb_client/models.py`. */
export type ModelOutput = { response: string };

/** Request timeout — vision calls can take 60s+ on free tier. */
export const ANALYZE_TIMEOUT_MS = 120_000;

/** Map HTTP/backend failures to human footer messages. */
export function toUserMessage(status: number, detail: string): string {
  if (status === 401) return "Invalid API key — check backend .env.";
  if (status === 429)
    return "Rate limited (free 50/day burst) — wait, then retry. See /daily-limit.";
  if (status === 504 || status === 502) return "Backend/model timed out — retry.";
  if (status === 0) return "Backend unreachable — is `uv run fastapi dev` running on :8000?";
  return detail || `Request failed (${status}).`;
}

/** Sentinel from backend when no question is visible (see VISION_PROMPT). */
export const NO_QUESTION = "NO_QUESTION";

/** Backend normalizes variants; frontend matches leniently (NO_QUESTION. / newline / prefix ws). */
export function isNoQuestion(text: string): boolean {
  return /^\s*NO_QUESTION\b/i.test(text);
}

/** Friendly text shown when model returns NO_QUESTION (answer-only UX). */
export const NO_QUESTION_MESSAGE =
  "No question found — arrange the question behind the window and retry.";

async function parseOutput(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as ModelOutput | { detail?: string } | null;
  if (!res.ok) {
    const detail = data && "detail" in data && typeof data.detail === "string" ? data.detail : "";
    throw Object.assign(new Error(toUserMessage(res.status, detail)), { status: res.status });
  }
  if (!data || !("response" in data) || typeof data.response !== "string") {
    throw Object.assign(new Error("Model response did not contain usable text."), { status: 500 });
  }
  return data.response;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  // Link outer abort (unmount / new capture) to this request.
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Distinguish user-cancel vs timeout via outer signal state.
      if (signal?.aborted) throw Object.assign(new Error("Cancelled."), { status: 0 });
      throw Object.assign(new Error("Backend/model timed out — retry."), { status: 504 });
    }
    throw Object.assign(new Error(toUserMessage(0, "")), { status: 0 });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Trigger server-side screen grab + vision answer.
 * Use for New Capture button + Shift+Space (no focus steal).
 */
export async function postScreenCapture(signal?: AbortSignal): Promise<string> {
  const res = await fetchWithTimeout(
    `${BACKEND_URL}/analyze-screen`,
    { method: "POST", headers: { "X-RB-Client": "web" } },
    signal,
  );
  return parseOutput(res);
}

/** Upload an image blob (file-picker fallback / Electron PNG buffer path). */
export async function postImageBlob(blob: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("image", blob, "capture.png");
  const res = await fetchWithTimeout(
    `${BACKEND_URL}/analyze`,
    { method: "POST", headers: { "X-RB-Client": "web" }, body: form },
    signal,
  );
  return parseOutput(res);
}
