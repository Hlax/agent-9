import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { writeChangeRecord } from "@/lib/change-record";

const IDENTITY_FIELDS = "identity_id, name, name_status, name_rationale, naming_readiness_score, naming_readiness_notes, summary, philosophy, embodiment_direction, habitat_direction, active_avatar_artifact_id";

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
    let active_avatar_artifact_id: string | null | undefined =
      body.active_avatar_artifact_id === null || body.active_avatar_artifact_id === ""
        ? null
        : typeof body.active_avatar_artifact_id === "string"
          ? body.active_avatar_artifact_id.trim() || null
          : undefined;

    const { data: existing } = await supabase
      .from("identity")
      .select("identity_id, name, name_status, active_avatar_artifact_id")
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

    if (active_avatar_artifact_id !== undefined && active_avatar_artifact_id !== null) {
      const { data: art } = await supabase
        .from("artifact")
        .select("artifact_id, medium, current_approval_state")
        .eq("artifact_id", active_avatar_artifact_id)
        .single();
      if (!art) {
        return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
      }
      if (art.medium !== "image") {
        return NextResponse.json({ error: "Active avatar must be an image artifact." }, { status: 400 });
      }
      const allowed = ["approved", "approved_for_publication"];
      if (!allowed.includes(art.current_approval_state ?? "")) {
        return NextResponse.json(
          { error: "Artifact must be approved or approved_for_publication before setting as active avatar." },
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
    if (active_avatar_artifact_id !== undefined) updates.active_avatar_artifact_id = active_avatar_artifact_id;

    const approvedBy = user?.email ?? "harvey";

    if (existing) {
      const prevAvatar = existing.active_avatar_artifact_id ?? null;
      const { data: updated, error } = await supabase
        .from("identity")
        .update(updates)
        .eq("identity_id", existing.identity_id)
        .select(IDENTITY_FIELDS)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const newAvatar = updates.active_avatar_artifact_id as string | null | undefined;
      if (newAvatar !== undefined && newAvatar !== null && String(prevAvatar) !== String(newAvatar)) {
        await writeChangeRecord({
          supabase,
          change_type: "embodiment_update",
          initiated_by: "harvey",
          target_type: "artifact",
          target_id: newAvatar,
          title: "Active public avatar set",
          description: `Harvey set artifact ${newAvatar} as the active public avatar.`,
          reason: null,
          approved_by: approvedBy,
        });
      }
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
        active_avatar_artifact_id: active_avatar_artifact_id ?? null,
        status: "active",
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select(IDENTITY_FIELDS)
      .single();
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    if (active_avatar_artifact_id) {
      await writeChangeRecord({
        supabase,
        change_type: "embodiment_update",
        initiated_by: "harvey",
        target_type: "artifact",
        target_id: active_avatar_artifact_id,
        title: "Active public avatar set",
        description: `Harvey set artifact ${active_avatar_artifact_id} as the active public avatar.`,
        reason: null,
        approved_by: approvedBy,
      });
    }
    return NextResponse.json({ identity: created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
