/**
 * Write change_record when Harvey approves system/canon/identity/habitat changes.
 * Canon: docs/03_governance/change_record_system.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const CHANGE_TYPES = [
  "identity_update",
  "workflow_update",
  "system_update",
  "habitat_update",
  "embodiment_update",
  "evaluation_update",
  "governance_update",
  "other",
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

export interface WriteChangeRecordInput {
  supabase: SupabaseClient;
  change_type: ChangeType;
  initiated_by: "twin" | "harvey" | "system";
  target_type: string;
  target_id: string | null;
  title: string;
  description: string;
  reason?: string | null;
  approved_by?: string | null;
}

/**
 * Insert a change_record row. Call this when Harvey approves a proposal that affects
 * identity, embodiment, habitat, or system/canon.
 */
export async function writeChangeRecord(input: WriteChangeRecordInput): Promise<void> {
  const now = new Date().toISOString();
  const row = {
    change_type: input.change_type,
    initiated_by: input.initiated_by,
    target_type: input.target_type,
    target_id: input.target_id ?? null,
    title: input.title.slice(0, 500),
    description: input.description.slice(0, 2000),
    reason: input.reason?.slice(0, 1000) ?? null,
    approved: true,
    approved_by: input.approved_by ?? null,
    effective_at: now,
    created_at: now,
    updated_at: now,
  };
  await input.supabase.from("change_record").insert(row);
}
