/**
 * Runtime Electron bridge guard (hasBridge) — types live in types/electron.d.ts.
 * hasBridge() is runtime-safe in web dev (window.rb undefined) and Electron.
 */
export function hasBridge(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { rb?: unknown }).rb;
}
