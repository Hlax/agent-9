import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * PATCH /api/staging/proposal/note?id=... — update review_note for a proposal.
 * This is intentionally narrow: it only updates proposal_record.review_note.
 * State transitions remain governed by the canonical proposal APIs.
 */
export async function PATCH(request: Request) {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing proposal id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      review_note?: unknown;
    };
    const review_note =
      typeof body.review_note === "string" || body.review_note === null
        ? body.review_note
        : null;

    const { data, error } = await supabase
      .from("proposal_record")
      .update({ review_note, updated_at: new Date().toISOString() })
      .eq("proposal_record_id", id)
      .select("proposal_record_id, review_note")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update review_note" },
      { status: 500 }
    );
  }
}

