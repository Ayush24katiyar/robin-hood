/**
 * RB Assistant — testable capture seam (extracted from monolithic main).
 * Why extraction: main.cjs requires electron + boots windows at import, so
 * Vitest/node --test cannot import or mock it. These pure functions take
 * injected deps and are honestly unit-testable (node:test, no Electron boot).
 *
 * - grabScreenPNG({hide, show, getSources, primarySize, delayMs}): hide ->
 *   grab -> show in try/finally so overlay NEVER stays hidden on throw (High 1).
 *   Multi-monitor dropped per decision: takes sources[0], sized to primary.
 * - postAnalyze({fetchFn, backendURL, clientTag}, pngBuffer): multipart POST to
 *   /analyze with X-RB-Client header (CSRF guard, Batch 1 High 3).
 */

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function grabScreenPNG(deps) {
  const { hide, show, getSources, primarySize, delayMs = 120 } = deps;
  hide();
  try {
    await sleep(delayMs);
    const sources = await getSources({
      types: ["screen"],
      thumbnailSize: primarySize,
    });
    const png = sources[0]?.thumbnail?.toPNG();
    if (!png || png.length === 0) throw new Error("Screen grab empty.");
    return png;
  } finally {
    // Critical: overlay must come back even when getSources rejects.
    show();
  }
}

async function postAnalyze(deps, pngBuffer, opts = {}) {
  const { fetchFn, backendURL, clientTag = "electron", timeoutMs = 120_000 } = deps;
  const { signal: outerSignal } = opts;
  const blob = new Blob([pngBuffer], { type: "image/png" });
  const form = new FormData();
  form.append("image", blob, "capture.png");
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (outerSignal) outerSignal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${backendURL}/analyze`, {
      method: "POST",
      headers: { "X-RB-Client": clientTag },
      body: form,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.detail) || `Backend ${res.status}`);
    return (data && data.response) ?? "";
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener("abort", onAbort);
  }
}

module.exports = { grabScreenPNG, postAnalyze };
