/**
 * Built-in writing medium plugin. Delegates to generateWriting with preferMedium: null.
 * No proposalRole / targetSurface / proposalCapKey (writing does not create surface proposals in current design).
 */

import type { MediumPlugin, MediumGenerationContext, GeneratedArtifact } from "@twin/mediums";
import { generateWriting } from "../generate-writing.js";

export const writingPlugin: MediumPlugin = {
  id: "writing",
  label: "Writing",
  status: "active",
  capabilities: {
    can_generate: true,
    can_propose_surface: false,
    can_postprocess: false,
    can_upload: false,
    supports_staging_target: false,
  },
  canDeriveFromState: true,
  async generate(context: MediumGenerationContext): Promise<GeneratedArtifact> {
    const apiKey = context.openaiApiKey ?? process.env.OPENAI_API_KEY;
    const result = await generateWriting(
      {
        mode: context.mode,
        preferMedium: null,
        promptContext: context.promptContext,
        sourceContext: context.sourceContext,
        workingContext: context.workingContext,
      },
      { apiKey: apiKey ?? undefined }
    );
    return {
      title: result.title,
      summary: result.summary,
      content_text: result.content_text,
      medium: "writing",
      usage: result.usage,
    };
  },
};
