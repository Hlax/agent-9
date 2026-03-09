/**
 * Image generation path: OpenAI Images API (DALL-E).
 * Uses OPENAI_MODEL_IMAGE (default gpt-5-nano; for OpenAI Images API use dall-e-3 or dall-e-2).
 */

import type { SessionMode } from "@twin/core";

export interface GenerateImageInput {
  mode: SessionMode;
  promptContext?: string | null;
  /** Optional: context for the image prompt. */
  sourceContext?: string | null;
}

export interface GenerateImageOutput {
  title: string;
  summary: string;
  content_text: string;
  content_uri: string | null;
  medium: "image";
}

function buildImagePrompt(input: GenerateImageInput): string {
  const parts: string[] = [];
  if (input.promptContext?.trim()) {
    parts.push(input.promptContext.trim());
  }
  if (input.sourceContext?.trim()) {
    parts.push(`Context: ${input.sourceContext.slice(0, 500)}`);
  }
  if (parts.length === 0) {
    parts.push("A single evocative image that explores identity or creative expression.");
  }
  return parts.join(". ");
}

/**
 * Call OpenAI Images API to generate one image artifact.
 * Returns title, summary, content_text (prompt), content_uri (temporary URL).
 * Caller should upload to Supabase Storage and replace content_uri for permanence.
 */
export async function generateImage(
  input: GenerateImageInput,
  options?: { apiKey?: string }
): Promise<GenerateImageOutput> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for image generation");
  }

  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const prompt = buildImagePrompt(input);
  const model =
    process.env.OPENAI_MODEL_IMAGE ?? "gpt-5-nano";

  const response = await client.images.generate({
    model,
    prompt,
    n: 1,
    size: "1024x1024",
    response_format: "url",
  });

  const imageUrl = response.data[0]?.url ?? null;
  const title =
    input.promptContext?.slice(0, 100).trim() || "Generated image";
  const summary = prompt.slice(0, 300);

  return {
    title,
    summary,
    content_text: prompt,
    content_uri: imageUrl,
    medium: "image",
  };
}
