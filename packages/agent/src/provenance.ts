/**
 * Provenance: generation_run record stub for auditability.
 * Canon: session_id, artifact_id, medium, provider, model, prompt/context snapshot, timing, run_status.
 */

import type { GenerationRun, ArtifactMedium } from "@twin/core";

export interface CreateGenerationRunInput {
  session_id: string;
  artifact_id: string | null;
  medium: ArtifactMedium;
  provider_name?: string | null;
  model_name?: string | null;
  prompt_snapshot?: string | null;
  context_snapshot?: string | null;
  run_status?: string;
  started_at: string;
  ended_at?: string | null;
}

export function createGenerationRun(input: CreateGenerationRunInput): GenerationRun {
  return {
    generation_run_id: crypto.randomUUID(),
    session_id: input.session_id,
    artifact_id: input.artifact_id ?? null,
    medium: input.medium,
    provider_name: input.provider_name ?? null,
    model_name: input.model_name ?? null,
    prompt_snapshot: input.prompt_snapshot ?? null,
    context_snapshot: input.context_snapshot ?? null,
    run_status: input.run_status ?? "completed",
    started_at: input.started_at,
    ended_at: input.ended_at ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
