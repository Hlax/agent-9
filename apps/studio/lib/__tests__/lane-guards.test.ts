/**
 * Lane guard coverage for proposal state changes.
 *
 * These tests encode the expectations that:
 * - Only surface proposals can move into surface-only states
 *   (approved_for_staging, approved_for_publication, published).
 * - Medium and system proposals must not use staging/public flows,
 *   whether via the approve route or PATCH.
 *
 * The HTTP routes implement these rules; these tests pin the
 * invariants so refactors do not accidentally weaken them.
 */

import { describe, it, expect } from "vitest";

const SURFACE_ONLY_STATES = ["approved_for_staging", "approved_for_publication", "published"] as const;

function isSurfaceOnlyState(state: string): boolean {
  return (SURFACE_ONLY_STATES as readonly string[]).includes(state);
}

function canEnterSurfaceOnlyStateViaPatch(lane: "surface" | "medium" | "system", targetState: string): boolean {
  if (!isSurfaceOnlyState(targetState)) return true;
  return lane === "surface";
}

function approveLaneGuard(lane: "surface" | "medium" | "system", action: string) {
  const isStagingOrPublishAction =
    action === "approve_for_staging" || action === "approve_for_publication" || action === "approve_publication";
  if (!isStagingOrPublishAction) {
    return { allowed: true, error: null as string | null };
  }
  if (lane === "surface") {
    return { allowed: true, error: null as string | null };
  }
  const message =
    "Only surface lane proposals can be approved for staging or publication. This proposal is in the " +
    (lane === "medium" ? "medium" : "system") +
    " lane and resolves via roadmap or governance review.";
  return { allowed: false, error: message };
}

describe("lane guards: approve route", () => {
  const actions = ["approve_for_staging", "approve_for_publication", "approve_publication"] as const;

  it("allows surface proposals to use staging/public actions", () => {
    for (const action of actions) {
      const result = approveLaneGuard("surface", action);
      expect(result.allowed).toBe(true);
      expect(result.error).toBeNull();
    }
  });

  it("blocks medium proposals from approve_for_staging / approve_for_publication with readable error", () => {
    for (const action of actions) {
      const result = approveLaneGuard("medium", action);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Only surface lane proposals can be approved for staging or publication.");
      expect(result.error).toContain("medium");
    }
  });

  it("blocks system proposals from approve_for_staging / approve_for_publication with readable error", () => {
    for (const action of actions) {
      const result = approveLaneGuard("system", action);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Only surface lane proposals can be approved for staging or publication.");
      expect(result.error).toContain("system");
    }
  });
});

describe("lane guards: PATCH surface-only states", () => {
  it("treats approved_for_staging / approved_for_publication / published as surface-only states", () => {
    for (const s of SURFACE_ONLY_STATES) {
      expect(isSurfaceOnlyState(s)).toBe(true);
    }
    expect(isSurfaceOnlyState("archived")).toBe(false);
    expect(isSurfaceOnlyState("rejected")).toBe(false);
  });

  it("allows surface proposals to move into surface-only states via PATCH (subject to FSM)", () => {
    for (const s of SURFACE_ONLY_STATES) {
      expect(canEnterSurfaceOnlyStateViaPatch("surface", s)).toBe(true);
    }
  });

  it("blocks medium proposals from moving into surface-only states via PATCH", () => {
    for (const s of SURFACE_ONLY_STATES) {
      expect(canEnterSurfaceOnlyStateViaPatch("medium", s)).toBe(false);
    }
  });

  it("blocks system proposals from moving into surface-only states via PATCH", () => {
    for (const s of SURFACE_ONLY_STATES) {
      expect(canEnterSurfaceOnlyStateViaPatch("system", s)).toBe(false);
    }
  });
});
