import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const IDENTITY_FIELDS = "identity_id, name, name_status, name_rationale, naming_readiness_score, naming_readiness_notes, summary, philosophy, embodiment_direction, habitat_direction";

/**
 * GET /api/identity — return the active identity row.
 * Returns null if none. Must return the row even when name is null.
 * Canon: one canonical identity; name optional.
 */
export async function GET() {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ identity: null });
    }
    const { data, error } = await supabase
      .from("identity")
      .select(IDENTITY_FIELDS)
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ identity: data ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/identity — update the active identity (explicit identity update only).
 * Body: optional name, summary, philosophy, embodiment_direction, habitat_direction.
 * - If an active row exists: update only provided fields.
 * - If none exists: create one (only when this is explicit Identity page save), with name null unless provided.
 * Must allow name to be omitted or blank. Never called from source-items.
 */
export async function PATCH(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() || null : undefined;
    const summary = typeof body.summary === "string" ? body.summary.trim() || null : undefined;
    const philosophy = typeof body.philosophy === "string" ? body.philosophy.trim() || null : undefined;
    const embodiment_direction = typeof body.embodiment_direction === "string" ? body.embodiment_direction.trim() || null : undefined;
    const habitat_direction = typeof body.habitat_direction === "string" ? body.habitat_direction.trim() || null : undefined;

    const { data: existing } = await supabase
      .from("identity")
      .select("identity_id, name, name_status")
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.name_status === "accepted" && existing.name) {
      if (name !== undefined && (name === null || name !== existing.name)) {
        return NextResponse.json(
          { error: "Name is already accepted. Do not clear or change it; use the name proposal flow to revisit." },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    if (name !== undefined) updates.name = name;
    if (summary !== undefined) updates.summary = summary;
    if (philosophy !== undefined) updates.philosophy = philosophy;
    if (embodiment_direction !== undefined) updates.embodiment_direction = embodiment_direction;
    if (habitat_direction !== undefined) updates.habitat_direction = habitat_direction;

    if (existing) {
      const { data: updated, error } = await supabase
        .from("identity")
        .update(updates)
        .eq("identity_id", existing.identity_id)
        .select(IDENTITY_FIELDS)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ identity: updated });
    }

    // No active identity: create one (explicit identity setup only)
    const { data: created, error: insertError } = await supabase
      .from("identity")
      .insert({
        version_label: "v0",
        name: name ?? null,
        summary: summary ?? null,
        philosophy: philosophy ?? null,
        embodiment_direction: embodiment_direction ?? null,
        habitat_direction: habitat_direction ?? null,
        status: "active",
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select(IDENTITY_FIELDS)
      .single();
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ identity: created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
