import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isOverTokenLimit,
  getLowTokenThreshold,
  getMaxSessionsPerHour,
  getArchiveDecayHalfLifeDays,
} from "../stop-limits";

describe("stop-limits", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.MAX_TOKENS_PER_SESSION = process.env.MAX_TOKENS_PER_SESSION;
    saved.LOW_TOKEN_THRESHOLD = process.env.LOW_TOKEN_THRESHOLD;
    saved.MAX_SESSIONS_PER_HOUR = process.env.MAX_SESSIONS_PER_HOUR;
    saved.ARCHIVE_DECAY_HALF_LIFE_DAYS = process.env.ARCHIVE_DECAY_HALF_LIFE_DAYS;
    delete process.env.MAX_TOKENS_PER_SESSION;
    delete process.env.LOW_TOKEN_THRESHOLD;
    delete process.env.MAX_SESSIONS_PER_HOUR;
    delete process.env.ARCHIVE_DECAY_HALF_LIFE_DAYS;
  });
  afterEach(() => {
    if (saved.MAX_TOKENS_PER_SESSION !== undefined) process.env.MAX_TOKENS_PER_SESSION = saved.MAX_TOKENS_PER_SESSION;
    if (saved.LOW_TOKEN_THRESHOLD !== undefined) process.env.LOW_TOKEN_THRESHOLD = saved.LOW_TOKEN_THRESHOLD;
    if (saved.MAX_SESSIONS_PER_HOUR !== undefined) process.env.MAX_SESSIONS_PER_HOUR = saved.MAX_SESSIONS_PER_HOUR;
    if (saved.ARCHIVE_DECAY_HALF_LIFE_DAYS !== undefined) process.env.ARCHIVE_DECAY_HALF_LIFE_DAYS = saved.ARCHIVE_DECAY_HALF_LIFE_DAYS;
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

  it("getMaxSessionsPerHour returns 4 when unset", () => {
    expect(getMaxSessionsPerHour()).toBe(4);
  });

  it("getMaxSessionsPerHour returns parsed env value", () => {
    process.env.MAX_SESSIONS_PER_HOUR = "8";
    expect(getMaxSessionsPerHour()).toBe(8);
  });

  it("getMaxSessionsPerHour returns 0 when set to 0 (no cap)", () => {
    process.env.MAX_SESSIONS_PER_HOUR = "0";
    expect(getMaxSessionsPerHour()).toBe(0);
  });

  it("getArchiveDecayHalfLifeDays returns 60 when unset", () => {
    expect(getArchiveDecayHalfLifeDays()).toBe(60);
  });

  it("getArchiveDecayHalfLifeDays returns parsed env value", () => {
    process.env.ARCHIVE_DECAY_HALF_LIFE_DAYS = "30";
    expect(getArchiveDecayHalfLifeDays()).toBe(30);
  });

  it("getArchiveDecayHalfLifeDays falls back to 60 for invalid values", () => {
    process.env.ARCHIVE_DECAY_HALF_LIFE_DAYS = "0";
    expect(getArchiveDecayHalfLifeDays()).toBe(60);
    process.env.ARCHIVE_DECAY_HALF_LIFE_DAYS = "abc";
    expect(getArchiveDecayHalfLifeDays()).toBe(60);
  });
});
