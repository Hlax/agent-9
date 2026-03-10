import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isOverTokenLimit, getLowTokenThreshold } from "../stop-limits";

describe("stop-limits", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.MAX_TOKENS_PER_SESSION = process.env.MAX_TOKENS_PER_SESSION;
    saved.LOW_TOKEN_THRESHOLD = process.env.LOW_TOKEN_THRESHOLD;
    delete process.env.MAX_TOKENS_PER_SESSION;
    delete process.env.LOW_TOKEN_THRESHOLD;
  });
  afterEach(() => {
    if (saved.MAX_TOKENS_PER_SESSION !== undefined) process.env.MAX_TOKENS_PER_SESSION = saved.MAX_TOKENS_PER_SESSION;
    if (saved.LOW_TOKEN_THRESHOLD !== undefined) process.env.LOW_TOKEN_THRESHOLD = saved.LOW_TOKEN_THRESHOLD;
  });

  it("isOverTokenLimit returns false when MAX_TOKENS_PER_SESSION is 0 or unset", () => {
    expect(isOverTokenLimit(1000)).toBe(false);
    process.env.MAX_TOKENS_PER_SESSION = "0";
    expect(isOverTokenLimit(1000)).toBe(false);
  });

  it("isOverTokenLimit returns true when tokens used exceed limit", () => {
    process.env.MAX_TOKENS_PER_SESSION = "500";
    expect(isOverTokenLimit(501)).toBe(true);
    expect(isOverTokenLimit(500)).toBe(false);
    expect(isOverTokenLimit(undefined)).toBe(false);
  });

  it("getLowTokenThreshold returns 0 when unset", () => {
    expect(getLowTokenThreshold()).toBe(0);
  });

  it("getLowTokenThreshold returns parsed env value", () => {
    process.env.LOW_TOKEN_THRESHOLD = "10000";
    expect(getLowTokenThreshold()).toBe(10000);
  });
});
