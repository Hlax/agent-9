import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/chat/clear-thread — clear conversation state for a thread so the next message gets a fresh Twin (no "stuck" name or history).
 * Body: { threadId?: string }. If omitted, uses the first thread.
 * Clears openai_response_id and deletes messages for that thread.
 */
export async function POST(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    let threadId = typeof body?.threadId === "string" ? body.threadId.trim() : null;
    if (!threadId) {
      const { data: threads } = await supabase
        .from("chat_thread")
        .select("thread_id")
        .limit(1)
        .order("created_at", { ascending: true });
      threadId = threads?.[0]?.thread_id ?? null;
    }
    if (!threadId) return NextResponse.json({ ok: true, threadId: null });

    await supabase.from("chat_message").delete().eq("thread_id", threadId);
    await supabase
      .from("chat_thread")
      .update({ openai_response_id: null, updated_at: new Date().toISOString() })
      .eq("thread_id", threadId);

    return NextResponse.json({ ok: true, threadId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Clear failed" },
      { status: 500 }
    );
  }
}
