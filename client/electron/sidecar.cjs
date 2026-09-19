/**
 * RB Assistant — sidecar seam (Batch 1 extraction, Batch 2 poll).
 * Why a seam: main.cjs cannot be imported in tests (Electron boot), so
 * spawn + health-poll live here with injected deps for honest unit tests.
 */
const path = require("node:path");

function resolveExePath({ resourcesPath, dirname, platform }) {
  if (platform === "win32") return path.join(resourcesPath || dirname, "sidecar", "rb-server.exe");
  return path.join(resourcesPath || dirname, "sidecar", "rb-server");
}

/** Poll GET / until sidecar ready (fixes first-hotkey connection-refused race). */
async function pollBackend(fetchFn, url, tries = 20, intervalMs = 500) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchFn(`${url}/`);
      if (res && res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

module.exports = { resolveExePath, pollBackend };
