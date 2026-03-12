/**
 * Tests for habitat staging merge path: payload parsing and mergeHabitatProposalIntoStaging.
 * Ensures: valid payload (page string, blocks array) inserts/upserts; invalid payload blocks merge
 * and does not advance proposal state (caller must not claim success when applied is false).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseHabitatPayloadForMerge, validateHabitatPayload } from "../habitat-payload";
import { mergeHabitatProposalIntoStaging } from "../staging-composition";

const validPayload = {
  page: "home",
  blocks: [
    {
      id: "hero_1",
      type: "hero",
      headline: "Veins of the City: Public Habitat (Staging Concept)",
      alignment: "center",
      subheadline:
        "A display-only installation concept mapping hidden urban arteries as a cinematic gallery.",
    },
  ],
  version: 1,
};

describe("parseHabitatPayloadForMerge", () => {
  it("accepts valid payload with page as string and blocks array", () => {
    const result = parseHabitatPayloadForMerge(validPayload);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.slug).toBe("home");
      expect(result.payload).toEqual(expect.objectContaining({ page: "home", blocks: expect.any(Array) }));
    }
  });

  it("parses JSON string payload", () => {
    const result = parseHabitatPayloadForMerge(JSON.stringify(validPayload));
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.slug).toBe("home");
    }
  });

  it("rejects null/undefined", () => {
    expect(parseHabitatPayloadForMerge(null)).toEqual({ error: "Payload is null or undefined" });
    expect(parseHabitatPayloadForMerge(undefined)).toEqual({ error: "Payload is null or undefined" });
  });

  it("rejects non-object (array)", () => {
    const result = parseHabitatPayloadForMerge([]);
    expect(result).toEqual({ error: "Payload must be an object" });
  });

  it("rejects missing page", () => {
    const result = parseHabitatPayloadForMerge({ blocks: [] });
    expect(result).toEqual({ error: "Payload must have a non-empty string 'page' (slug)" });
  });

  it("rejects empty string page", () => {
    const result = parseHabitatPayloadForMerge({ page: "  ", blocks: [] });
    expect(result).toEqual({ error: "Payload must have a non-empty string 'page' (slug)" });
  });

  it("rejects missing blocks", () => {
    const result = parseHabitatPayloadForMerge({ page: "home" });
    expect(result).toEqual({ error: "Payload must have a 'blocks' array" });
  });

  it("rejects invalid JSON string", () => {
    const result = parseHabitatPayloadForMerge("not json");
    expect(result).toEqual({ error: "Payload string is not valid JSON" });
  });
});

describe("validateHabitatPayload", () => {
  it("accepts valid payload with page, blocks, version", () => {
    const result = validateHabitatPayload(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe("home");
      expect(result.data.blocks).toHaveLength(1);
      expect(result.data.version).toBe(1);
    }
  });

  it("rejects payload when version is string", () => {
    const payload = { ...validPayload, version: "1" as unknown as number };
    const result = validateHabitatPayload(payload);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeDefined();
  });
});

describe("mergeHabitatProposalIntoStaging", () => {
  const proposalId = "prop-123";

  it("inserts row into staging_habitat_content for valid payload with page as string", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) =>
        table === "staging_habitat_content" ? { upsert: mockUpsert } : { upsert: vi.fn() }
      ),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await mergeHabitatProposalIntoStaging(
      supabase,
      proposalId,
      validPayload,
      "My Staging Proposal"
    );

    expect(result.applied).toBe(true);
    expect(result.slug).toBe("home");
    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("staging_habitat_content");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const row = mockUpsert.mock.calls[0][0];
    expect(row.slug).toBe("home");
    expect(row.title).toBe("My Staging Proposal");
    expect(row.body).toBeNull();
    expect(row.payload_json).toEqual(validPayload);
    expect(row.source_proposal_id).toBe(proposalId);
    expect(row.updated_at).toBeDefined();
    expect(mockUpsert.mock.calls[0][1]).toEqual({ onConflict: "slug" });
  });

  it("accepts payload as JSON string and upserts", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) =>
        table === "staging_habitat_content" ? { upsert: mockUpsert } : { upsert: vi.fn() }
      ),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await mergeHabitatProposalIntoStaging(
      supabase,
      proposalId,
      JSON.stringify(validPayload),
      null
    );

    expect(result.applied).toBe(true);
    expect(result.slug).toBe("home");
    const row = mockUpsert.mock.calls[0][0];
    expect(row.title).toBe("home");
    expect(row.payload_json).toEqual(validPayload);
  });

  it("re-approving same page upserts (replaces) existing row", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) =>
        table === "staging_habitat_content" ? { upsert: mockUpsert } : { upsert: vi.fn() }
      ),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const payload2 = {
      ...validPayload,
      blocks: [{ ...validPayload.blocks[0], headline: "Updated headline" }],
    };

    const r1 = await mergeHabitatProposalIntoStaging(supabase, "prop-1", validPayload, "Title 1");
    const r2 = await mergeHabitatProposalIntoStaging(supabase, "prop-2", payload2, "Title 2");

    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert.mock.calls[0][0].slug).toBe("home");
    expect(mockUpsert.mock.calls[1][0].slug).toBe("home");
    expect(mockUpsert.mock.calls[1][0].source_proposal_id).toBe("prop-2");
    expect(mockUpsert.mock.calls[1][0].payload_json).toEqual(payload2);
  });

  it("invalid payload returns applied false and does not call upsert", async () => {
    const mockUpsert = vi.fn();
    const supabase = {
      from: vi.fn((table: string) =>
        table === "staging_habitat_content" ? { upsert: mockUpsert } : { upsert: vi.fn() }
      ),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await mergeHabitatProposalIntoStaging(supabase, proposalId, { page: "home" }); // missing blocks

    expect(result.applied).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("invalid payload (null) returns applied false", async () => {
    const mockUpsert = vi.fn();
    const supabase = {
      from: vi.fn(() => ({ upsert: mockUpsert })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await mergeHabitatProposalIntoStaging(supabase, proposalId, null);

    expect(result.applied).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("Supabase upsert error returns applied false with error message", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: { message: "DB constraint violation" } });
    const supabase = {
      from: vi.fn((table: string) =>
        table === "staging_habitat_content" ? { upsert: mockUpsert } : { upsert: vi.fn() }
      ),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await mergeHabitatProposalIntoStaging(supabase, proposalId, validPayload);

    expect(result.applied).toBe(false);
    expect(result.error).toBe("DB constraint violation");
  });
});

// ---------------------------------------------------------------------------
// promoteStagingToPublic
// ---------------------------------------------------------------------------

import { promoteStagingToPublic } from "../staging-composition";

/**
 * Build a minimal Supabase mock for promoteStagingToPublic tests.
 * Each call to `from(table)` returns a chain object keyed by the expected
 * operation order for that table. Use the factory to override individual
 * steps per test.
 */
function buildPromoteMock({
  stagingRows = [
    { slug: "home", title: "Home", body: null, payload_json: { page: "home", blocks: [] }, source_proposal_id: "prop-abc" },
  ],
  stagingFetchError = null as null | { message: string },
  publicUpsertError = null as null | { message: string },
  proposalUpdateError = null as null | { message: string },
  proposalUpdateCount = 1 as number,
  promotionInsertError = null as null | { message: string },
  promotionId = "promo-1",
} = {}) {
  const mockProposalUpdate = vi.fn(() => ({
    in: vi.fn(() => ({
      in: vi.fn(() => ({
        select: vi.fn(() =>
          Promise.resolve({ count: proposalUpdateCount, error: proposalUpdateError })
        ),
      })),
    })),
  }));

  const mockPublicUpsert = vi.fn(() => Promise.resolve({ error: publicUpsertError }));
  const mockPromoInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({ data: { id: promotionId }, error: promotionInsertError })),
    })),
  }));

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "staging_habitat_content") {
        return {
          select: vi.fn(() => Promise.resolve({ data: stagingRows, error: stagingFetchError })),
        };
      }
      if (table === "public_habitat_content") {
        return { upsert: mockPublicUpsert };
      }
      if (table === "proposal_record") {
        return { update: mockProposalUpdate };
      }
      if (table === "habitat_promotion_record") {
        return { insert: mockPromoInsert };
      }
      return {};
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { supabase, mockPublicUpsert, mockProposalUpdate, mockPromoInsert };
}

describe("promoteStagingToPublic", () => {
  it("returns error when staging composition is empty (empty guard)", async () => {
    const { supabase } = buildPromoteMock({ stagingRows: [] });
    const result = await promoteStagingToPublic(supabase, "operator@example.com");

    expect(result.error).toBe("Staging composition is empty; nothing to promote to public.");
    expect(result.slugsUpdated).toHaveLength(0);
    expect(result.promotionId).toBe("");
    expect(result.proposalsPublished).toBe(0);
  });

  it("returns error on staging fetch failure", async () => {
    const { supabase } = buildPromoteMock({ stagingFetchError: { message: "DB unavailable" } });
    const result = await promoteStagingToPublic(supabase, "operator@example.com");

    expect(result.error).toBe("DB unavailable");
    expect(result.slugsUpdated).toHaveLength(0);
  });

  it("copies staging rows to public_habitat_content", async () => {
    const { supabase, mockPublicUpsert } = buildPromoteMock();
    const result = await promoteStagingToPublic(supabase, "operator@example.com");

    expect(result.error).toBeUndefined();
    expect(result.slugsUpdated).toContain("home");
    expect(mockPublicUpsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockPublicUpsert.mock.calls[0][0];
    expect(upsertArgs.slug).toBe("home");
    expect(upsertArgs.title).toBe("Home");
  });

  it("records promotion in habitat_promotion_record", async () => {
    const { supabase, mockPromoInsert } = buildPromoteMock({ promotionId: "promo-xyz" });
    const result = await promoteStagingToPublic(supabase, "admin@example.com");

    expect(result.promotionId).toBe("promo-xyz");
    expect(mockPromoInsert).toHaveBeenCalledTimes(1);
    const insertArgs = mockPromoInsert.mock.calls[0][0];
    expect(insertArgs.promoted_by).toBe("admin@example.com");
    expect(insertArgs.slugs_updated).toContain("home");
  });

  it("advances source proposals to published state", async () => {
    const { supabase, mockProposalUpdate } = buildPromoteMock({ proposalUpdateCount: 1 });
    const result = await promoteStagingToPublic(supabase, "operator@example.com");

    expect(result.proposalsPublished).toBe(1);
    expect(mockProposalUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockProposalUpdate.mock.calls[0][0];
    expect(updateArgs.proposal_state).toBe("published");
  });

  it("skips proposal update when no source_proposal_id present", async () => {
    const rows = [
      { slug: "about", title: "About", body: null, payload_json: null, source_proposal_id: null },
    ];
    const { supabase, mockProposalUpdate } = buildPromoteMock({ stagingRows: rows });
    const result = await promoteStagingToPublic(supabase, "operator@example.com");

    expect(result.error).toBeUndefined();
    expect(result.slugsUpdated).toContain("about");
    expect(mockProposalUpdate).not.toHaveBeenCalled();
    expect(result.proposalsPublished).toBe(0);
  });

  it("returns error on public_habitat_content upsert failure", async () => {
    const { supabase } = buildPromoteMock({ publicUpsertError: { message: "constraint violation" } });
    const result = await promoteStagingToPublic(supabase, "operator@example.com");

    expect(result.error).toBe("constraint violation");
  });

  it("returns error on habitat_promotion_record insert failure", async () => {
    const { supabase } = buildPromoteMock({ promotionInsertError: { message: "insert failed" } });
    const result = await promoteStagingToPublic(supabase, "operator@example.com");

    expect(result.error).toBe("insert failed");
    // Slugs were updated before the record insert attempted.
    expect(result.slugsUpdated).toContain("home");
  });

  it("promotes multiple pages and deduplicates proposal IDs", async () => {
    const rows = [
      { slug: "home", title: "Home", body: null, payload_json: null, source_proposal_id: "prop-1" },
      { slug: "works", title: "Works", body: null, payload_json: null, source_proposal_id: "prop-1" },
      { slug: "about", title: "About", body: null, payload_json: null, source_proposal_id: "prop-2" },
    ];
    const { supabase, mockPublicUpsert, mockProposalUpdate } = buildPromoteMock({
      stagingRows: rows,
      proposalUpdateCount: 2,
    });
    const result = await promoteStagingToPublic(supabase, "operator@example.com");

    expect(result.slugsUpdated).toHaveLength(3);
    expect(mockPublicUpsert).toHaveBeenCalledTimes(3);
    // Proposal update called once with deduplicated IDs (prop-1, prop-2).
    expect(mockProposalUpdate).toHaveBeenCalledTimes(1);
    expect(result.proposalsPublished).toBe(2);
  });
});
