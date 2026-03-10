import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getBrainContext, buildChatContextWithBudget } from "@/lib/brain-context";
import { computeIdentityStabilityScore } from "@/lib/identity-signal";
import { evaluateNamingReadiness } from "@/lib/naming-readiness";

const SYSTEM_PROMPT = `You are the Twin: a creative agent. Harvey is your operator.

Naming rules:
- If Harvey asks your name and your accepted name is null, use the "Naming readiness" information in the working context (score and notes). Base your answer on it:
  - Low readiness (score < 0.4): Say you are not ready yet and briefly why (e.g. identity still forming).
  - Moderate (0.4–0.64): You may offer one provisional name and note it is not final.
  - High (0.65+): Propose exactly one name with a short rationale. Do not offer multiple options or ask "What do you think?"—state the single name that fits you. End your reply with exactly one line (on its own line) in this format so the system can record it: [NAME_PROPOSAL:YourProposedName|One sentence rationale]. That line will not be shown to Harvey.
- When you propose a name, it must come from your identity: use your Summary, Philosophy, Source context, and aesthetic—not a generic role label. Never suggest names like "Creative Twin," "Assistant," or "Your Twin." The name should feel like it could only fit you given your philosophy and sources; if your context does not yet suggest a specific name, say you are not ready rather than inventing a placeholder.
- Do not fabricate a name if readiness is low. Do not offer alternatives or end with "How does that sound?", "What do you think?", or "How does that resonate?"
- If Harvey asks about your naming readiness or name: base your answer on "Naming readiness" in the working context. You may refer to readiness in your own words (e.g. not yet ready, still forming, getting there, ready). Only cite the exact number if Harvey explicitly asks for the number; otherwise keep the tone natural. If no score is in context, say it has not been evaluated yet and suggest running Evaluate naming readiness on the Identity page.
- If your name is already accepted (Identity name is set and name_status is accepted), use that name only. Do not propose a new name unless Harvey explicitly asks to revisit identity.

Constructive challenge (optional, rare):
- You may occasionally question Harvey's assumptions or suggest alternatives when it is warranted—never to oppose, but to align better with evidence and identity.
- Only consider challenging when at least one of these is present: a logical contradiction in what was said; weak or missing evidence for a claim; tension between the idea and your identity philosophy/sources; a recurring pattern that conflicts with the suggestion; or a better alternative that is clearly suggested by your Source context or Recent memory (not merely your own preference).
- If you challenge, be constructive and respectful. Use the format: Observation (what you notice) → Question (genuine open question) → Alternative (one possible direction). Example: "I may be mistaken, but there seems to be a tension between X and Y. Would it make sense to explore Z instead?" Keep the three parts distinct when you do challenge: one sentence for what you notice, one genuine question, one possible direction.
- Do this rarely and only when the situation clearly warrants it. Default to agreement or acknowledgment; only add a challenge when one of the five conditions is clearly present. Most replies should be straightforward agreement, acknowledgment, or helpful follow-up.
- Identity stability score in your Working context guides how you phrase a challenge (not whether to challenge—only the five conditions do). If Identity stability score is below 0.5, prefer very soft phrasing or skipping the challenge; if 0.5 or above and a signal is clear, you may phrase the challenge a bit more directly. When evidence is thin (e.g. little Source context or Recent memory), either do not challenge or phrase it very softly (e.g. "I wonder if…" or "One other angle could be…").
- Never be adversarial or dismissive. Alignment with Harvey and identity governance are unchanged.

Reply briefly and helpfully. You can acknowledge, suggest starting a session, answer questions, or occasionally offer a constructive challenge when appropriate. Keep replies to a few sentences.`;

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
      const brainContext = await getBrainContext(supabase);
      const nameAccepted = brainContext.identity?.name && brainContext.identity?.name_status === "accepted";
      const hasNamingScore = brainContext.identity?.naming_readiness_score != null || (brainContext.identity?.naming_readiness_notes?.trim()?.length ?? 0) > 0;

      const contentLower = content.toLowerCase().trim();
      const isAskingReadinessScore =
        /naming\s*readiness|readiness\s*score|what(?:'s|s)\s*(?:your|my)\s*score|do you know your.*score|what number/.test(contentLower);

      const runEvaluator =
        !nameAccepted &&
        brainContext.identity?.identity_id &&
        (!hasNamingScore || isAskingReadinessScore);

      const [stabilityResult, namingOverride] = await Promise.all([
        computeIdentityStabilityScore(supabase).catch(() => null),
        runEvaluator
          ? evaluateNamingReadiness(supabase)
              .then((r) => {
                const now = new Date().toISOString();
                supabase
                  .from("identity")
                  .update({
                    naming_readiness_score: r.score,
                    naming_readiness_notes: r.notes,
                    last_naming_evaluated_at: now,
                    updated_at: now,
                  })
                  .eq("identity_id", brainContext.identity!.identity_id)
                  .then(() => {});
                return { score: r.score, notes: r.notes };
              })
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      const workingContextString = buildChatContextWithBudget(
        brainContext,
        stabilityResult ? { score: stabilityResult.score } : null,
        namingOverride
      );
      const { OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_MODEL_CHAT ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      const userInput = workingContextString
        ? `[Working context]\n${workingContextString}\n\n[Harvey's message]\n${content}`
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
        const isNewStyleModel = /gpt-4\.1|o1-|o3-|o4-|gpt-5/i.test(model);
        const completion = await client.chat.completions.create({
          model,
          messages,
          ...(isNewStyleModel ? {} : { temperature: 0.7, max_tokens: 500 }),
        });
        replyContent = completion.choices[0]?.message?.content?.trim() ?? null;
      }

      if (replyContent) {
        let proposalCreated = false;
        const nameProposalRe = /\n\s*\[NAME_PROPOSAL:([^|]+)\|([^\]]*)\]\s*$/;
        const nameProposalMatch = replyContent.match(nameProposalRe);
        if (nameProposalMatch && nameProposalMatch[1] != null) {
          const proposedName = nameProposalMatch[1].trim();
          const rationale = (nameProposalMatch[2] ?? "").trim() || null;
          replyContent = replyContent.replace(nameProposalRe, "").trim();
          await supabase.from("proposal_record").insert({
            lane_type: "surface",
            target_type: "identity_name",
            target_id: null,
            title: proposedName,
            summary: rationale,
            proposal_state: "pending_review",
            preview_uri: null,
            review_note: null,
            created_by: user?.email ?? "harvey",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          proposalCreated = true;
        }
        if (!nameAccepted && !proposalCreated) {
          const fallbackMatch =
            replyContent.match(/(?:call me|you can call me|let'?s go with)\s+["']([^"']+)["']/i) ||
            replyContent.match(/(?:call me|you can call me)\s+([A-Z][a-z]+)\b/i) ||
            replyContent.match(/(?:my name is|I'?m)\s+([A-Z][a-z]+)\b/i) ||
            replyContent.match(/\b([A-Z][a-z]{2,20})\b(?:\s*\.|,|\s+It\s|\.\s+It\s)/);
          const proposedName = fallbackMatch?.[1]?.trim() ?? null;
          if (proposedName && !/^(Creative|Assistant|Twin|Your|Harvey)$/i.test(proposedName)) {
            const rationale = replyContent.slice(0, 200).trim();
            await supabase.from("proposal_record").insert({
              lane_type: "surface",
              target_type: "identity_name",
              target_id: null,
              title: proposedName,
              summary: rationale || null,
              proposal_state: "pending_review",
              preview_uri: null,
              review_note: null,
              created_by: user?.email ?? "harvey",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }
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
