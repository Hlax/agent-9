import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const BOOTSTRAP_ITEMS = 30;
const MAX_TEXT_PER_ITEM = 1500;

/**
 * POST /api/identity/bootstrap — generate initial identity from source library.
 * Aggregates identity_seed and reference items, calls model to distill summary, philosophy,
 * embodiment_direction, habitat_direction. Preserves existing name (never invents or overwrites).
 * Canon: explicit bootstrap only; sources inform identity, do not become identity.
 */
export async function POST() {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: rows, error: fetchError } = await supabase
      .from("source_item")
      .select("title, source_type, source_role, summary, content_text, extracted_text, transcript_text, tags, ontology_notes, identity_relevance_notes, identity_weight")
      .in("source_type", ["identity_seed", "reference"])
      .order("identity_weight", { ascending: false, nullsFirst: false })
      .order("ingested_at", { ascending: false })
      .limit(BOOTSTRAP_ITEMS);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!rows?.length) {
      return NextResponse.json(
        { error: "No eligible source items (identity_seed or reference). Add sources first." },
        { status: 400 }
      );
    }

    const parts = rows.map((row: {
      title?: string | null;
      source_type?: string | null;
      source_role?: string | null;
      summary?: string | null;
      content_text?: string | null;
      extracted_text?: string | null;
      transcript_text?: string | null;
      tags?: string[] | null;
      ontology_notes?: string | null;
      identity_relevance_notes?: string | null;
      identity_weight?: number | null;
    }) => {
      const title = row.title?.trim() || "Untitled";
      const type = row.source_type || "reference";
      const role = row.source_role ? ` role=${row.source_role}` : "";
      const weight = row.identity_weight != null ? ` weight=${row.identity_weight}` : "";
      const tagStr = row.tags?.length ? ` tags=${row.tags.join(", ")}` : "";
      const summary = row.summary?.trim();
      const content = row.content_text?.trim();
      const extracted = row.extracted_text?.trim();
      const transcript = row.transcript_text?.trim();
      const ontology = row.ontology_notes?.trim();
      const relevance = row.identity_relevance_notes?.trim();
      const body = [summary, content, extracted, transcript, ontology, relevance]
        .filter(Boolean)
        .join("\n")
        .slice(0, MAX_TEXT_PER_ITEM);
      return `[${type}${role}${weight}] ${title}${tagStr}\n${body}`;
    });
    const digest = parts.join("\n\n---\n\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY required for bootstrap" }, { status: 503 });
    }

    const { OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const isNewStyleModel = /gpt-4\.1|o1-|o3-|o4-|gpt-5/i.test(model);
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are distilling a coherent identity from source material. Output ONLY a JSON object with exactly these keys: "summary", "philosophy", "embodiment_direction", "habitat_direction". Each value is a short string (a few sentences max). Do not invent a name. Do not add any other keys or commentary.`,
        },
        {
          role: "user",
          content: `Sources (evidence only; do not copy verbatim):\n\n${digest.slice(0, 12000)}\n\nProduce the JSON object with summary, philosophy, embodiment_direction, habitat_direction. Do not invent a name.`,
        },
      ],
      response_format: { type: "json_object" },
      ...(isNewStyleModel ? {} : { temperature: 0.5 }),
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json({ error: "Empty model response" }, { status: 500 });
    }

    let parsed: { summary?: string; philosophy?: string; embodiment_direction?: string; habitat_direction?: string };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return NextResponse.json({ error: "Invalid JSON from model" }, { status: 500 });
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 2000) : null;
    const philosophy = typeof parsed.philosophy === "string" ? parsed.philosophy.trim().slice(0, 2000) : null;
    const embodiment_direction = typeof parsed.embodiment_direction === "string" ? parsed.embodiment_direction.trim().slice(0, 2000) : null;
    const habitat_direction = typeof parsed.habitat_direction === "string" ? parsed.habitat_direction.trim().slice(0, 2000) : null;

    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("identity")
      .select("identity_id, name")
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from("identity")
        .update({
          summary: summary ?? undefined,
          philosophy: philosophy ?? undefined,
          embodiment_direction: embodiment_direction ?? undefined,
          habitat_direction: habitat_direction ?? undefined,
          updated_at: now,
        })
        .eq("identity_id", existing.identity_id);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      const { data: updated } = await supabase
        .from("identity")
        .select("identity_id, name, summary, philosophy, embodiment_direction, habitat_direction")
        .eq("identity_id", existing.identity_id)
        .single();
      return NextResponse.json({ identity: updated, bootstrapped: true });
    }

    const { data: created, error: insertError } = await supabase
      .from("identity")
      .insert({
        version_label: "v0",
        name: null,
        summary,
        philosophy,
        embodiment_direction,
        habitat_direction,
        status: "active",
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select("identity_id, name, summary, philosophy, embodiment_direction, habitat_direction")
      .single();
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ identity: created, bootstrapped: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bootstrap failed" },
      { status: 500 }
    );
  }
}
