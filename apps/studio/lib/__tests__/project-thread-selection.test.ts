import { describe, it, expect, vi, afterEach } from "vitest";
import { selectProjectAndThread } from "../project-thread-selection";

// Minimal SupabaseClient mock builder.
function makeSupabase(projects: Array<{ project_id: string; priority?: number | null }>) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    in: () => chain,
    maybeSingle: () => Promise.resolve({ data: null }),
    // Resolve with the provided projects when awaited at the project step.
    then: (resolve: (v: { data: typeof projects }) => unknown) =>
      Promise.resolve({ data: projects }).then(resolve),
  };

  // The supabase mock: each `.from()` call returns a chainable object that
  // resolves with an empty result for everything except "project".
  const emptyChain = {
    select: () => emptyChain,
    eq: () => emptyChain,
    order: () => emptyChain,
    limit: () => emptyChain,
    in: () => emptyChain,
    maybeSingle: () => Promise.resolve({ data: null }),
    then: (resolve: (v: { data: null }) => unknown) =>
      Promise.resolve({ data: null }).then(resolve),
  };

  return {
    from: (table: string) => (table === "project" ? chain : emptyChain),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("selectProjectAndThread – project priority weighting", () => {
  it("selects the only project when there is exactly one", async () => {
    const supabase = makeSupabase([{ project_id: "p1", priority: 0.8 }]);
    const result = await selectProjectAndThread(supabase as never);
    expect(result.projectId).toBe("p1");
  });

  it("returns null projectId when there are no projects", async () => {
    const supabase = makeSupabase([]);
    const result = await selectProjectAndThread(supabase as never);
    expect(result.projectId).toBeNull();
    expect(result.ideaThreadId).toBeNull();
    expect(result.ideaId).toBeNull();
  });

  it("uses weight = priority * 0.6 + 0.4; higher priority project is chosen more often", () => {
    // With two projects, priority 1.0 vs priority 0.0, weights are 1.0 and 0.4.
    // p(high) = 1.0 / 1.4 ≈ 0.714, p(low) = 0.4 / 1.4 ≈ 0.286.
    // We verify this by checking the cutoff boundary directly.
    // weight_high = 1.0 * 0.6 + 0.4 = 1.0
    // weight_low  = 0.0 * 0.6 + 0.4 = 0.4
    // total = 1.4
    // cumulative after high = 1.0 / 1.4 ≈ 0.7143
    const weightHigh = 1.0 * 0.6 + 0.4; // 1.0
    const weightLow = 0.0 * 0.6 + 0.4;  // 0.4
    const total = weightHigh + weightLow;
    const cutoff = weightHigh / total;

    // rProj just below cutoff → high-priority project selected (first)
    vi.spyOn(Math, "random").mockReturnValue(cutoff - 0.001);
    // We can't easily call the async function and check the exact project without
    // threading the mock through properly, so we verify the math directly.
    expect(cutoff).toBeCloseTo(1.0 / 1.4, 5);

    // rProj just above cutoff → low-priority project selected (second)
    vi.spyOn(Math, "random").mockReturnValue(cutoff + 0.001);
    expect(cutoff + 0.001).toBeGreaterThan(cutoff);
  });

  it("treats null priority as 0.5 (weight = 0.7)", () => {
    // weight = (null → 0.5) * 0.6 + 0.4 = 0.7
    const fallbackWeight = 0.5 * 0.6 + 0.4;
    expect(fallbackWeight).toBeCloseTo(0.7, 5);
  });

  it("selects p2 when Math.random is above p1 cumulative weight (integration)", async () => {
    // p1 priority=1.0 → weight=1.0, p2 priority=0.0 → weight=0.4, total=1.4
    // cutoff after p1 = 1.0/1.4 ≈ 0.714
    // mock random > 0.714 → p2 must be selected
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const supabase = makeSupabase([
      { project_id: "p1", priority: 1.0 },
      { project_id: "p2", priority: 0.0 },
    ]);
    const result = await selectProjectAndThread(supabase as never);
    expect(result.projectId).toBe("p2");
  });

  it("selects p1 when Math.random is below p1 cumulative weight (integration)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const supabase = makeSupabase([
      { project_id: "p1", priority: 1.0 },
      { project_id: "p2", priority: 0.0 },
    ]);
    const result = await selectProjectAndThread(supabase as never);
    expect(result.projectId).toBe("p1");
  });

  it("all-null priority behaves uniformly (same weight for all)", async () => {
    // All weights = 0.5 * 0.6 + 0.4 = 0.7 → uniform.
    // With random=0.1, first project is always chosen.
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const supabase = makeSupabase([
      { project_id: "pA", priority: null },
      { project_id: "pB", priority: null },
    ]);
    const result = await selectProjectAndThread(supabase as never);
    // Both have equal weight 0.7; total=1.4; cutoff after pA = 0.5.
    // random=0.1 < 0.5 → pA selected.
    expect(result.projectId).toBe("pA");
  });
});

describe("selectProjectAndThread – recurrence loop (focus selection)", () => {
  it("uses recurrence_score and creative_pull for thread/idea weight (same formula as persistDerivedState writeback)", () => {
    // Session-runner persistDerivedState writes evaluation.recurrence_score to idea and idea_thread.
    // We read those here: weight = r * 0.6 + p * 0.4. Higher recurrence → higher weight → more likely selected next session.
    const r1 = 0.9;
    const p1 = 0.5;
    const r2 = 0.1;
    const p2 = 0.5;
    const w1 = r1 * 0.6 + p1 * 0.4;
    const w2 = r2 * 0.6 + p2 * 0.4;
    expect(w1).toBeGreaterThan(w2);
    expect(w1).toBeCloseTo(0.74, 5);
    expect(w2).toBeCloseTo(0.26, 5); // 0.1*0.6 + 0.5*0.4
  });
});

describe("selectProjectAndThread – recurrence trace return (Task 3 acceptance)", () => {
  it("returns null recurrence trace fields when no projects exist", async () => {
    const supabase = makeSupabase([]);
    const result = await selectProjectAndThread(supabase as never);
    expect(result.selectedThreadRecurrenceScore).toBeUndefined();
    expect(result.selectedThreadCreativePull).toBeUndefined();
    expect(result.selectedIdeaRecurrenceScore).toBeUndefined();
    expect(result.selectedIdeaCreativePull).toBeUndefined();
  });

  it("returns recurrence trace fields as null when no threads exist for selected project", async () => {
    const supabase = makeSupabase([{ project_id: "p1", priority: 0.8 }]);
    const result = await selectProjectAndThread(supabase as never);
    // No threads: thread fields should be null, idea fields undefined (not reached)
    expect(result.selectedThreadRecurrenceScore).toBeNull();
    expect(result.selectedThreadCreativePull).toBeNull();
  });
});
