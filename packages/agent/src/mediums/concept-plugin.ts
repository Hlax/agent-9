/**
 * Built-in concept medium plugin. Delegates to generateWriting with preferMedium: "concept".
 *
 * Reserved / future-facing (not yet enforced by runner): proposalRole, targetSurface, proposalCapKey.
 * Phase 1 runner still branches on artifact.medium; Phase 3+ will use registry.canPropose and plugin metadata.
 */

import type { MediumPlugin, MediumGenerationContext, GeneratedArtifact } from "@twin/mediums";
import { generateWriting } from "../generate-writing.js";

export const conceptPlugin: MediumPlugin = {
  id: "concept",
  label: "Concept",
  status: "active",
  capabilities: {
    can_generate: true,
    can_propose_surface: true,
    can_postprocess: false,
    can_upload: false,
    supports_staging_target: true,
  },
  canDeriveFromState: true,
  /** Reserved for Phase 3+ proposal routing. */
  proposalRole: "habitat_layout",
  targetSurface: "staging_habitat",
  proposalCapKey: "habitat_layout",
  async generate(context: MediumGenerationContext): Promise<GeneratedArtifact> {
    const apiKey = context.openaiApiKey ?? process.env.OPENAI_API_KEY;
    const result = await generateWriting(
      {
        mode: context.mode,
        preferMedium: "concept",
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
      medium: "concept",
      usage: result.usage,
    };
  },
};
