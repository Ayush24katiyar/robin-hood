/**
 * Unit tests for backend client pure logic.
 * Run: `bunx vitest run src/lib/analyze.test.ts`
 * Covers error mapping + button contract (disabled while capturing is in component).
 */
import { describe, expect, it } from "vitest";
import { NO_QUESTION, NO_QUESTION_MESSAGE, isNoQuestion, toUserMessage } from "./analyze";

describe("toUserMessage", () => {
  it("maps 401 to key message", () => {
    expect(toUserMessage(401, "")).toMatch(/API key/i);
  });

  it("maps 429 to rate-limit with quota hint", () => {
    expect(toUserMessage(429, "")).toMatch(/Rate limited/i);
  });

  it("maps 0 to backend-down hint", () => {
    expect(toUserMessage(0, "")).toMatch(/fastapi dev/i);
  });

  it("passes through detail for unknown codes", () => {
    expect(toUserMessage(500, "boom")).toBe("boom");
  });
});

describe("NO_QUESTION contract", () => {
  it("sentinel matches backend", () => {
    expect(NO_QUESTION).toBe("NO_QUESTION");
  });

  it("friendly message guides retry", () => {
    expect(NO_QUESTION_MESSAGE).toMatch(/No question found/i);
  });

  it("matches variants leniently", () => {
    expect(isNoQuestion("NO_QUESTION.")).toBe(true);
    expect(isNoQuestion("  NO_QUESTION\nwhatever")).toBe(true);
    expect(isNoQuestion("Answer: 42")).toBe(false);
  });
});
