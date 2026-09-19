/**
 * Honest unit tests for electron/capture.cjs seam (no Electron boot).
 * Run: node --test electron/capture.test.cjs  (no vitest needed, zero quota).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { grabScreenPNG, postAnalyze } = require("./capture.cjs");
const { pollBackend, resolveExePath } = require("./sidecar.cjs");

describe("grabScreenPNG", () => {
  it("shows window again even when getSources rejects (High 1)", async () => {
    let shown = 0;
    let hidden = 0;
    await assert.rejects(
      grabScreenPNG({
        hide: () => hidden++,
        show: () => shown++,
        getSources: async () => {
          throw new Error("denied");
        },
        primarySize: { width: 1920, height: 1080 },
        delayMs: 0,
      }),
      /denied/,
    );
    assert.equal(hidden, 1);
    assert.equal(shown, 1); // finally path — overlay never stuck hidden
  });

  it("returns PNG bytes on success", async () => {
    const fake = Buffer.from([1, 2, 3]);
    const out = await grabScreenPNG({
      hide: () => {},
      show: () => {},
      getSources: async () => [{ thumbnail: { toPNG: () => fake } }],
      primarySize: { width: 10, height: 10 },
      delayMs: 0,
    });
    assert.equal(out, fake);
  });
});

describe("postAnalyze", () => {
  it("sends X-RB-Client header to /analyze", async () => {
    let seen = null;
    const fetchFn = async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ response: "hi" }) };
    };
    const out = await postAnalyze(
      { fetchFn, backendURL: "http://127.0.0.1:8000", clientTag: "electron" },
      Buffer.from([9]),
    );
    assert.equal(out, "hi");
    assert.match(seen.url, /\/analyze$/);
    assert.equal(seen.init.headers["X-RB-Client"], "electron");
  });
});

describe("pollBackend", () => {
  it("returns true on third try", async () => {
    let n = 0;
    const fetchFn = async () => (++n < 3 ? { ok: false } : { ok: true });
    assert.equal(await pollBackend(fetchFn, "http://x", 5, 0), true);
    assert.equal(n, 3);
  });
  it("resolves exe per platform", () => {
    assert.match(resolveExePath({ dirname: "/a", platform: "win32" }), /rb-server\.exe$/);
    assert.match(resolveExePath({ dirname: "/a", platform: "linux" }), /rb-server$/);
  });
});
