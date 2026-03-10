/**
 * Image generation path: OpenAI Images API (DALL-E).
 * When the user leaves the prompt empty, the Twin invents an image prompt from the seed (identity + sources).
 */

import type { SessionMode } from "@twin/core";

export interface GenerateImageInput {
  mode: SessionMode;
  promptContext?: string | null;
  /** Optional: context for the image prompt (identity, sources, etc.). */
  sourceContext?: string | null;
}

export interface GenerateImageOutput {
  title: string;
  summary: string;
  content_text: string;
  content_uri: string | null;
  medium: "image";
}

const IMAGE_PROMPT_SYSTEM = `You are the Twin: a creative system. Your task is to write a single, concrete image prompt for DALL-E (one or two sentences).
The prompt should be visual and specific: style, mood, composition, and subject. No meta-commentary or "image of...". Output only the prompt text, nothing else.`;

/**
 * When the user did not provide a prompt, use GPT to invent one from the seed (sourceContext).
 */
async function generateImagePromptFromSeed(
  sourceContext: string,
  options: { apiKey: string }
): Promise<string> {
  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: options.apiKey });
  const model = process.env.OPENAI_MODEL_CHAT ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const isNewStyleModel = /gpt-4\.1|o1-|o3-|o4-|gpt-5/i.test(model);
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: IMAGE_PROMPT_SYSTEM },
      {
        role: "user",
        content: `From this identity and source context, write one DALL-E image prompt that could only come from this Twin.\n\nContext:\n${sourceContext.slice(0, 1500)}`,
      },
    ],
    ...(isNewStyleModel ? {} : { max_tokens: 150, temperature: 0.8 }),
  });
  const text = completion.choices[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : "A single evocative image that explores identity or creative expression.";
}

/**
 * Build the final image prompt: use user's prompt if present, else seed-only text, or invent one via GPT when we have seed.
 */
async function resolveImagePrompt(
  input: GenerateImageInput,
  options: { apiKey: string }
): Promise<string> {
  const userPrompt = input.promptContext?.trim();
  if (userPrompt) {
    const parts = [userPrompt];
    if (input.sourceContext?.trim()) {
      parts.push(`Context: ${input.sourceContext.slice(0, 400)}`);
    }
    return parts.join(". ");
  }
  if (input.sourceContext?.trim()) {
    return generateImagePromptFromSeed(input.sourceContext, options);
  }
  return "A single evocative image that explores identity or creative expression.";
}

/**
 * Call OpenAI Images API to generate one image artifact.
 * When prompt is empty, the Twin generates its own prompt from identity/sources (via GPT), then DALL-E draws it.
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

  const prompt = await resolveImagePrompt(input, { apiKey });
  const model = process.env.OPENAI_MODEL_IMAGE ?? "dall-e-3";

  const response = await client.images.generate({
    model,
    prompt,
    n: 1,
    size: "1024x1024",
    response_format: "url",
  });

  const imageUrl = response.data?.[0]?.url ?? null;
  const title = input.promptContext?.slice(0, 100).trim() || "Generated image";
  const summary = prompt.slice(0, 300);

  return {
    title,
    summary,
    content_text: prompt,
    content_uri: imageUrl,
    medium: "image",
  };
}
