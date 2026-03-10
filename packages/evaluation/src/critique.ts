/**
 * Self-critique: produce a critique record from an artifact using the canonical rubric.
 * Canon: docs/03_governance/self_critique_system.md. Critique is qualitative; evaluation is separate.
 */

import type { CritiqueRecord, CritiqueOutcome } from "@twin/core";

export interface CritiqueInput {
  artifact_id: string;
  session_id: string | null;
  /** Artifact content (or preview) for critique. */
  content_preview?: string | null;
  /** Optional title/summary for context. */
  title?: string | null;
  summary?: string | null;
}

const OUTCOMES: CritiqueOutcome[] = [
  "continue",
  "branch",
  "shift_medium",
  "reflect",
  "archive_candidate",
  "stop",
];

const RUBRIC_SYSTEM = `You are the Twin's self-critique layer. Judge the artifact using the canonical rubric.
Be specific: what did it attempt, what worked, what failed, how does the medium fit, does it create future potential?
Output a JSON object with these keys (each a short string or null): intent_note, strength_note, originality_note, energy_note, potential_note, medium_fit_note, coherence_note, fertility_note, overall_summary.
Also output "critique_outcome" as one of: continue, branch, shift_medium, reflect, archive_candidate, stop.
Do not output approval or publication; this is internal judgment only. Respond with only the JSON object.`;

/**
 * Run self-critique on an artifact. Uses GPT when API key is available; otherwise returns a minimal stub.
 */
export async function runCritique(
  input: CritiqueInput,
  options?: { apiKey?: string | null }
): Promise<CritiqueRecord> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  const content =
    input.content_preview?.trim() ?? input.title ?? "No content";
  const now = new Date().toISOString();

  if (!apiKey || content === "No content") {
    return {
      critique_record_id: crypto.randomUUID(),
      artifact_id: input.artifact_id,
      session_id: input.session_id,
      intent_note: "Stub: no API key or content",
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: null,
      coherence_note: null,
      fertility_note: null,
      overall_summary: "Stub critique.",
      critique_outcome: "continue",
      created_at: now,
      updated_at: now,
    };
  }

  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const userContent = `Artifact title: ${input.title ?? "Untitled"}\nSummary: ${input.summary ?? "—"}\nContent:\n${content.slice(0, 6000)}`;

  const model = process.env.OPENAI_MODEL_CRITIQUE ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const isNewStyleModel = /gpt-4\.1|o1-|o3-|o4-|gpt-5/i.test(model);
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: RUBRIC_SYSTEM },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    ...(isNewStyleModel ? {} : { temperature: 0.3 }),
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    return {
      critique_record_id: crypto.randomUUID(),
      artifact_id: input.artifact_id,
      session_id: input.session_id,
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: null,
      coherence_note: null,
      fertility_note: null,
      overall_summary: "Critique call returned empty.",
      critique_outcome: "continue",
      created_at: now,
      updated_at: now,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      critique_record_id: crypto.randomUUID(),
      artifact_id: input.artifact_id,
      session_id: input.session_id,
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: null,
      coherence_note: null,
      fertility_note: null,
      overall_summary: raw.slice(0, 500),
      critique_outcome: "continue",
      created_at: now,
      updated_at: now,
    };
  }

  const outcomeRaw = String(parsed.critique_outcome ?? "continue").toLowerCase();
  const critique_outcome: CritiqueOutcome = OUTCOMES.includes(outcomeRaw as CritiqueOutcome)
    ? (outcomeRaw as CritiqueOutcome)
    : "continue";

  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  return {
    critique_record_id: crypto.randomUUID(),
    artifact_id: input.artifact_id,
    session_id: input.session_id,
    intent_note: str(parsed.intent_note),
    strength_note: str(parsed.strength_note),
    originality_note: str(parsed.originality_note),
    energy_note: str(parsed.energy_note),
    potential_note: str(parsed.potential_note),
    medium_fit_note: str(parsed.medium_fit_note),
    coherence_note: str(parsed.coherence_note),
    fertility_note: str(parsed.fertility_note),
    overall_summary: str(parsed.overall_summary),
    critique_outcome,
    created_at: now,
    updated_at: now,
  };
}
