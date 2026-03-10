import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/human-feedback — record explicit human feedback on an entity.
 * Used primarily for artifact review (target_type: "artifact").
 *
 * Body:
 * {
 *   target_type: "artifact" | "idea" | "idea_thread" | "session",
 *   target_id: string,            // UUID
 *   feedback_type?: "rank" | "annotate" | "approve" | "reject" | ...,
 *   score?: number | null,        // 0–1
 *   note?: string | null,
 *   tags?: string[] | null
 * }
 */
export async function POST(request: Request) {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    let body: {
      target_type?: string;
      target_id?: string;
      feedback_type?: string;
      score?: number | null;
      note?: string | null;
      tags?: string[] | null;
    } = {};

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const target_type = body.target_type?.trim();
    const target_id = body.target_id?.trim();
    const hasScore = typeof body.score === "number";
    const score = hasScore ? body.score : null;
    const note = body.note && body.note.trim() ? body.note.trim() : null;
    const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()) : null;

    if (!target_type || !target_id) {
      return NextResponse.json({ error: "Missing target_type or target_id" }, { status: 400 });
    }

    let feedback_type = body.feedback_type?.trim();
    if (!feedback_type) {
      // Default: annotate when note is present, otherwise rank.
      feedback_type = note ? "annotate" : "rank";
    }

    if (!["artifact", "idea", "idea_thread", "session"].includes(target_type)) {
      return NextResponse.json({ error: "Unsupported target_type" }, { status: 400 });
    }

    const {
      data: { user },
    } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
    const created_by = user?.email || "harvey";

    const { error } = await supabase.from("human_feedback").insert({
      target_type,
      target_id,
      feedback_type,
      score,
      note,
      tags,
      created_by,
    });

    if (error) {
      return NextResponse.json({ error: `Feedback insert failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Feedback failed" },
      { status: 500 }
    );
  }
}

