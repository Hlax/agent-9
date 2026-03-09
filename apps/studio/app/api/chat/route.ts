import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSourceContextForSession } from "@/lib/source-context";

const DEFAULT_THREAD_LABEL = "default";

/**
 * GET /api/chat — list messages for a thread.
 * Query: threadId (optional). If omitted, uses or creates the default thread.
 */
export async function GET(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ messages: [], threadId: null });
    }
    const { searchParams } = new URL(request.url);
    let threadId = searchParams.get("threadId");
    if (!threadId) {
      const { data: threads } = await supabase
        .from("chat_thread")
        .select("thread_id")
        .limit(1)
        .order("created_at", { ascending: true });
      threadId = threads?.[0]?.thread_id ?? null;
      if (!threadId) {
        const { data: newThread, error: insertErr } = await supabase
          .from("chat_thread")
          .insert({})
          .select("thread_id")
          .single();
        if (insertErr || !newThread) {
          return NextResponse.json({ messages: [], threadId: null });
        }
        threadId = newThread.thread_id;
      }
    }
    const { data: messages, error } = await supabase
      .from("chat_message")
      .select("message_id, role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      threadId,
      messages: (messages ?? []).map((m) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load chat" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat — send a message and optionally get a Twin reply.
 * Body: { message: string, threadId?: string, reply?: boolean }.
 * If reply is true (default), the agent generates a reply and it is stored and returned.
 */
export async function POST(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const content = typeof body?.message === "string" ? body.message.trim() : "";
    const wantReply = body?.reply !== false;
    const threadIdParam = body?.threadId;

    if (!content) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    let threadId = threadIdParam;
    if (!threadId) {
      const { data: threads } = await supabase
        .from("chat_thread")
        .select("thread_id")
        .limit(1)
        .order("created_at", { ascending: true });
      threadId = threads?.[0]?.thread_id ?? null;
      if (!threadId) {
        const { data: newThread, error: insertErr } = await supabase
          .from("chat_thread")
          .insert({})
          .select("thread_id")
          .single();
        if (insertErr || !newThread) {
          return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
        }
        threadId = newThread.thread_id;
      }
    }

    const harveyMsgId = crypto.randomUUID();
    const { error: insertHarvey } = await supabase.from("chat_message").insert({
      message_id: harveyMsgId,
      thread_id: threadId,
      role: "harvey",
      content,
      created_at: new Date().toISOString(),
    });
    if (insertHarvey) {
      return NextResponse.json({ error: insertHarvey.message }, { status: 500 });
    }

    let replyContent: string | null = null;
    let twinMsgId: string | null = null;

    if (wantReply && process.env.OPENAI_API_KEY) {
      const sourceContext = await getSourceContextForSession(supabase);
      const { OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const systemPrompt = `You are the Twin: a creative agent. Harvey is your operator. Reply briefly and helpfully to their message. You can acknowledge, suggest starting a session, or answer questions about what you might do next. Keep replies to a few sentences.`;
      const recentMessages: { role: "user" | "assistant"; content: string }[] = [
        { role: "user", content },
      ];
      if (sourceContext) {
        recentMessages.unshift({
          role: "user",
          content: `[Context]\n${sourceContext.slice(0, 2000)}\n\n[Harvey's message]\n${content}`,
        });
      }
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.7,
        max_tokens: 500,
      });
      replyContent = completion.choices[0]?.message?.content?.trim() ?? null;
      if (replyContent) {
        twinMsgId = crypto.randomUUID();
        await supabase.from("chat_message").insert({
          message_id: twinMsgId,
          thread_id: threadId,
          role: "twin",
          content: replyContent,
          created_at: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      threadId,
      harveyMessageId: harveyMsgId,
      reply: replyContent,
      twinMessageId: twinMsgId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chat failed" },
      { status: 500 }
    );
  }
}
