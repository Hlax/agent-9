/**
 * One real generation path: GPT-backed writing/concept artifact.
 * Canon: writing or concept medium only; output goes to pending_review, not published.
 */

import type { SessionMode } from "@twin/core";

export interface GenerateWritingInput {
  mode: SessionMode;
  promptContext?: string | null;
  /** Optional: retrieved source snippets for identity/context (Phase 2). */
  sourceContext?: string | null;
}

export interface GenerateWritingOutput {
  title: string;
  summary: string;
  content_text: string;
  medium: "writing" | "concept";
}

const SYSTEM_PROMPT = `You are the Twin: a creative system that explores identity through generated artifacts.
Produce one short piece of writing or a conceptual note. Be specific and concrete, not vague.
Output exactly a JSON object with keys: "title", "summary", "body". Title and summary are brief; body is the main content (a few sentences to a short paragraph).`;

function buildUserPrompt(input: GenerateWritingInput): string {
  const parts: string[] = [];
  parts.push(`Mode: ${input.mode}.`);
  if (input.promptContext?.trim()) {
    parts.push(`Prompt or direction: ${input.promptContext.trim()}`);
  }
  if (input.sourceContext?.trim()) {
    parts.push(`Relevant context:\n${input.sourceContext.trim()}`);
  }
  if (parts.length === 1) {
    parts.push("Generate one short exploratory piece of writing or a concept note.");
  }
  parts.push("\nRespond with only the JSON object, no markdown or extra text.");
  return parts.join("\n");
}

/**
 * Call OpenAI GPT to generate one writing/concept artifact.
 * Returns title, summary, content_text. Caller sets artifact_id, session_id, approval/publication state.
 */
export async function generateWriting(
  input: GenerateWritingInput,
  options?: { apiKey?: string }
): Promise<GenerateWritingOutput> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for generation");
  }

  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const userPrompt = buildUserPrompt(input);

  const isConcept = input.mode === "reflect";
  const model = isConcept
    ? (process.env.OPENAI_MODEL_CONCEPT ?? process.env.OPENAI_MODEL_GENERATION ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini")
    : (process.env.OPENAI_MODEL_GENERATION ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini");
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("Empty response from GPT");
  }

  let parsed: { title?: string; summary?: string; body?: string };
  try {
    parsed = JSON.parse(raw) as { title?: string; summary?: string; body?: string };
  } catch {
    throw new Error("GPT response was not valid JSON");
  }

  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 500)
      : "Generated piece";
  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim().slice(0, 1000)
      : "";
  const body =
    typeof parsed.body === "string" && parsed.body.trim()
      ? parsed.body.trim()
      : raw.slice(0, 10000);

  const content_text = body;
  const medium: "writing" | "concept" = input.mode === "reflect" ? "concept" : "writing";

  return { title, summary, content_text, medium };
}
