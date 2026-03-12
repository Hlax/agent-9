/**
 * Built-in image medium plugin. Delegates to generateImage.
 * PostProcess (upload to storage) remains in runner for Phase 1 to avoid new deps.
 *
 * Reserved / future-facing (not yet enforced by runner): proposalRole, targetSurface, proposalCapKey.
 * Phase 1 runner still branches on artifact.medium; Phase 3+ will use registry.canPropose and plugin metadata.
 */

import type { MediumPlugin, MediumGenerationContext, GeneratedArtifact } from "@twin/mediums";
import { generateImage } from "../generate-image.js";

export const imagePlugin: MediumPlugin = {
  id: "image",
  label: "Image",
  status: "active",
  capabilities: {
    can_generate: true,
    can_propose_surface: true,
    can_postprocess: true,
    can_upload: true,
    supports_staging_target: false,
  },
  canDeriveFromState: true,
  /** Reserved for Phase 3+ proposal routing. */
  proposalRole: "avatar_candidate",
  targetSurface: "identity",
  proposalCapKey: "avatar_candidate",
  async generate(context: MediumGenerationContext): Promise<GeneratedArtifact> {
    const apiKey = context.openaiApiKey ?? process.env.OPENAI_API_KEY;
    const result = await generateImage(
      {
        mode: context.mode,
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
      medium: "image",
      content_uri: result.content_uri,
    };
  },
};
