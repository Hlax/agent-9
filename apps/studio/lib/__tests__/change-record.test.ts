import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeChangeRecord } from "../change-record";

describe("writeChangeRecord", () => {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const supabase = {
    from: vi.fn((table: string) => (table === "change_record" ? { insert: mockInsert } : { insert: vi.fn() })),
  } as unknown as ReturnType<typeof import("@supabase/supabase-js")["createClient"]>;

  beforeEach(() => {
    mockInsert.mockClear();
    supabase.from.mockClear();
  });

  it("inserts a change_record with approved true and correct change_type", async () => {
    await writeChangeRecord({
      supabase,
      change_type: "identity_update",
      initiated_by: "harvey",
      target_type: "proposal_record",
      target_id: "pid-123",
      title: "Identity name accepted",
      description: "Name proposal approved.",
      approved_by: "harvey@example.com",
    });

    expect(supabase.from).toHaveBeenCalledWith("change_record");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.approved).toBe(true);
    expect(row.change_type).toBe("identity_update");
    expect(row.approved_by).toBe("harvey@example.com");
    expect(row.target_id).toBe("pid-123");
  });
});
