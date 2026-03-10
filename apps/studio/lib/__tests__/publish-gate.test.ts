import { describe, it, expect } from "vitest";
import { passesStagingGate } from "../publish-gate";

describe("passesStagingGate", () => {
  it("returns true when no proposals", () => {
    expect(passesStagingGate([])).toBe(true);
  });

  it("returns false when proposals exist but none passed staging", () => {
    expect(passesStagingGate([{ proposal_state: "pending_review" }])).toBe(false);
    expect(passesStagingGate([{ proposal_state: "rejected" }, { proposal_state: "pending_review" }])).toBe(false);
  });

  it("returns true when at least one proposal passed staging", () => {
    expect(passesStagingGate([{ proposal_state: "approved_for_staging" }])).toBe(true);
    expect(passesStagingGate([{ proposal_state: "pending_review" }, { proposal_state: "staged" }])).toBe(true);
    expect(passesStagingGate([{ proposal_state: "approved_for_publication" }])).toBe(true);
    expect(passesStagingGate([{ proposal_state: "published" }])).toBe(true);
  });
});
