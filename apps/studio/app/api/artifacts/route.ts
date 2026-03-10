import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/artifacts — list artifacts for review (default: pending_review and needs_revision).
 * Requires auth when Supabase auth is configured.
 */
export async function GET(request: Request) {
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
      return NextResponse.json({ artifacts: [] });
    }

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state");
    const view = searchParams.get("view"); // queue | approved | archived

    let query = supabase
      .from("artifact")
      .select("artifact_id, title, summary, medium, current_approval_state, current_publication_state, created_at")
      .order("created_at", { ascending: false });

    if (view === "approved") {
      query = query.in("current_approval_state", [
        "approved",
        "approved_with_annotation",
        "approved_for_publication",
      ]);
    } else if (view === "archived") {
      query = query.eq("current_approval_state", "archived");
    } else if (state && state !== "all") {
      query = query.eq("current_approval_state", state);
    } else if (!state || state === "queue") {
      query = query.in("current_approval_state", [
        "pending_review",
        "needs_revision",
      ]);
    }

    const { data: artifacts, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ artifacts: artifacts ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "List failed" },
      { status: 500 }
    );
  }
}
