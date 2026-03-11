import { describe, it, expect } from "vitest";
import { normalizeBacklog, BACKLOG_FULL_AT, BACKLOG_PROPOSAL_STATES } from "../curation-backlog";

describe("normalizeBacklog (C-4)", () => {
  it("returns 0 when count is 0", () => {
    expect(normalizeBacklog(0)).toBe(0);
  });

  it("returns 0.5 for half of the denominator", () => {
    expect(normalizeBacklog(5)).toBeCloseTo(0.5);
  });

  it("returns 1.0 exactly at the denominator", () => {
    expect(normalizeBacklog(10)).toBe(1.0);
  });

  it("clamps to 1.0 when count exceeds denominator", () => {
    expect(normalizeBacklog(15)).toBe(1.0);
    expect(normalizeBacklog(100)).toBe(1.0);
  });

  it("returns correct fractional values", () => {
    expect(normalizeBacklog(1)).toBeCloseTo(0.1);
    expect(normalizeBacklog(3)).toBeCloseTo(0.3);
    expect(normalizeBacklog(7)).toBeCloseTo(0.7);
  });

  it("respects a custom fullAt denominator", () => {
    expect(normalizeBacklog(5, 5)).toBe(1.0);
    expect(normalizeBacklog(5, 20)).toBeCloseTo(0.25);
    expect(normalizeBacklog(1, 4)).toBeCloseTo(0.25);
  });

  it("returns 0 when fullAt is 0 (guard against division by zero)", () => {
    expect(normalizeBacklog(10, 0)).toBe(0);
  });

  it("returns 0 when fullAt is negative (semantically invalid)", () => {
    expect(normalizeBacklog(5, -1)).toBe(0);
    expect(normalizeBacklog(5, -10)).toBe(0);
  });

  it("default denominator is BACKLOG_FULL_AT (10)", () => {
    expect(normalizeBacklog(BACKLOG_FULL_AT)).toBe(1.0);
    expect(normalizeBacklog(BACKLOG_FULL_AT / 2)).toBeCloseTo(0.5);
  });

  it("result is always between 0 and 1 inclusive", () => {
    for (const count of [0, 1, 5, 9, 10, 11, 50]) {
      const result = normalizeBacklog(count);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

describe("BACKLOG_PROPOSAL_STATES (C-4)", () => {
  it("includes pending_review", () => {
    expect(BACKLOG_PROPOSAL_STATES).toContain("pending_review");
  });

  it("includes approved, approved_for_staging, approved_for_publication", () => {
    expect(BACKLOG_PROPOSAL_STATES).toContain("approved");
    expect(BACKLOG_PROPOSAL_STATES).toContain("approved_for_staging");
    expect(BACKLOG_PROPOSAL_STATES).toContain("approved_for_publication");
  });

  it("includes staged and needs_revision (in-progress work)", () => {
    expect(BACKLOG_PROPOSAL_STATES).toContain("staged");
    expect(BACKLOG_PROPOSAL_STATES).toContain("needs_revision");
  });

  it("does not include terminal states (published, rejected, archived, ignored)", () => {
    const terminal = ["published", "rejected", "archived", "ignored"];
    for (const state of terminal) {
      expect(BACKLOG_PROPOSAL_STATES).not.toContain(state);
    }
  });
});
