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
