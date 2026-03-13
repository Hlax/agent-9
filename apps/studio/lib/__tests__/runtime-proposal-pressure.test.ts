import { describe, it, expect } from "vitest";
import { computeProposalConfidenceMin } from "../session-runner";

describe("computeProposalConfidenceMin — bounded proposal_pressure influence", () => {
  it("leaves confidence floor unchanged when proposal_pressure is normal or undefined", () => {
    const base = 0.4;
    expect(computeProposalConfidenceMin(base, "normal")).toBeCloseTo(base, 5);
    expect(computeProposalConfidenceMin(base, null)).toBeCloseTo(base, 5);
    // @ts-expect-error runtime may pass undefined
    expect(computeProposalConfidenceMin(base, undefined)).toBeCloseTo(base, 5);
  });

  it("raises confidence floor slightly when proposal_pressure is high (damping cadence)", () => {
    const base = 0.4;
    const adjusted = computeProposalConfidenceMin(base, "high");
    expect(adjusted).toBeGreaterThan(base);
    expect(adjusted).toBeCloseTo(0.45, 5);
  });

  it("lowers confidence floor slightly when proposal_pressure is low (encouraging proposals)", () => {
    const base = 0.4;
    const adjusted = computeProposalConfidenceMin(base, "low");
    expect(adjusted).toBeLessThan(base);
    expect(adjusted).toBeCloseTo(0.35, 5);
  });

  it("never adjusts the confidence floor by more than ±0.05", () => {
    const base = 0.4;
    const high = computeProposalConfidenceMin(base, "high");
    const low = computeProposalConfidenceMin(base, "low");
    expect(Math.abs(high - base)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(low - base)).toBeLessThanOrEqual(0.05);
  });

  it("clamps the adjusted floor to [0, 1]", () => {
    const nearTop = computeProposalConfidenceMin(0.98, "high");
    const nearBottom = computeProposalConfidenceMin(0.02, "low");
    expect(nearTop).toBeLessThanOrEqual(1);
    expect(nearTop).toBeGreaterThanOrEqual(0);
    expect(nearBottom).toBeGreaterThanOrEqual(0);
    expect(nearBottom).toBeLessThanOrEqual(1);
  });
}

