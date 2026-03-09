import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSourceContextForSession } from "@/lib/source-context";

const SYSTEM_PROMPT = `You are the Twin: a creative agent. Harvey is your operator. Reply briefly and helpfully to their message. You can acknowledge, suggest starting a session, or answer questions about what you might do next. Keep replies to a few sentences.`;

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
 * Uses OpenAI Responses API with previous_response_id for persistent conversation state when
 * available; falls back to Chat Completions otherwise. Thread's openai_response_id is updated after each reply.
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
    let openaiResponseId: string | null = null;
    if (!threadId) {
      const { data: threads } = await supabase
        .from("chat_thread")
        .select("thread_id, openai_response_id")
        .limit(1)
        .order("created_at", { ascending: true });
      threadId = threads?.[0]?.thread_id ?? null;
      openaiResponseId = threads?.[0]?.openai_response_id ?? null;
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
    } else {
      const { data: thread } = await supabase
        .from("chat_thread")
        .select("openai_response_id")
        .eq("thread_id", threadId)
        .single();
      openaiResponseId = thread?.openai_response_id ?? null;
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
      const model = process.env.OPENAI_MODEL_CHAT ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      const userInput = sourceContext
        ? `[Context]\n${sourceContext.slice(0, 2000)}\n\n[Harvey's message]\n${content}`
        : content;

      const useResponsesApi =
        typeof (client as unknown as { responses?: { create?: unknown } }).responses?.create === "function";

      if (useResponsesApi) {
        try {
          const responses = (client as unknown as { responses: { create: (opts: unknown) => Promise<{ id: string; output_text?: string }> } }).responses;
          const opts: {
            model: string;
            instructions?: string;
            input: string | { role: string; content: string }[];
            previous_response_id?: string;
            store?: boolean;
            max_output_tokens?: number;
          } = {
            model,
            input: openaiResponseId ? [{ role: "user", content: userInput }] : userInput,
            store: true,
            max_output_tokens: 500,
          };
          if (!openaiResponseId) {
            opts.instructions = SYSTEM_PROMPT;
          } else {
            opts.previous_response_id = openaiResponseId;
          }
          const response = await responses.create(opts);
          replyContent = (response.output_text ?? "").trim() || null;
          if (response.id) {
            await supabase
              .from("chat_thread")
              .update({
                openai_response_id: response.id,
                updated_at: new Date().toISOString(),
              })
              .eq("thread_id", threadId);
          }
        } catch {
          replyContent = null;
        }
      }

      if (replyContent === null) {
        const messages: { role: "user" | "assistant" | "system"; content: string }[] = [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userInput },
        ];
        const completion = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 500,
        });
        replyContent = completion.choices[0]?.message?.content?.trim() ?? null;
      }

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
