/**
 * Session pipeline: start session → load context → generate → critique → evaluate → store.
 * Canon: docs/02_runtime/session_loop.md.
 * Phase G: one real GPT-backed writing/concept path; persistence delegated to callers.
 * When registry + executed_medium are provided, generation is dispatched via the medium registry.
 */

import type {
  Artifact,
  CreativeSession,
  CreativeDrive,
  SessionMode,
  ArtifactMedium,
} from "@twin/core";
import type { MediumRegistry } from "@twin/mediums";
import { generateWriting } from "./generate-writing.js";
import { generateImage } from "./generate-image.js";

export interface SessionContext {
  /** Loaded for session start; identity, recent sessions, threads, etc. */
  identityId?: string;
  projectId?: string;
  /** Selected idea thread for lineage and context. */
  ideaThreadId?: string | null;
  /** Selected idea for lineage and context. */
  ideaId?: string | null;
  mode: SessionMode;
  /** Selected drive for this session (from drive weights). */
  selectedDrive?: CreativeDrive | null;
  promptContext?: string | null;
  /**
   * Identity, creative state, and recent memory context for voice-driven generation.
   * Injected into the generation system prompt so the LLM writes as this specific entity
   * and carries forward ongoing themes. Distinct from sourceContext (reference material).
   */
  workingContext?: string | null;
  /** Optional: retrieved source context for generation (Phase 2 identity seed). */
  sourceContext?: string | null;
  /** When "image", generate an image artifact (OPENAI_MODEL_IMAGE); otherwise writing/concept. */
  preferMedium?: "writing" | "concept" | "image" | null;
}

export interface SessionPipelineResult {
  session: CreativeSession;
  artifacts: Artifact[];
  /** Total tokens used this session (prompt + completion) when available. */
  tokensUsed?: number;
}

/**
 * Run one creative session.
 * Generates one writing/concept artifact via GPT; artifact is pending_review, private.
 * Persistence (and critique/evaluation) is delegated to callers.
 */
export async function runSessionPipeline(
  context: SessionContext,
  options?: {
    supabase?: unknown;
    /** Pass OPENAI_API_KEY from caller (e.g. Studio API route) */
    openaiApiKey?: string | null;
    /** When set, generation is dispatched via the medium registry (Phase 1). */
    registry?: MediumRegistry;
    /** Executed medium for this run (required when registry is set). */
    executed_medium?: string | null;
  }
): Promise<SessionPipelineResult> {
  const session: CreativeSession = {
    session_id: crypto.randomUUID(),
    project_id: context.projectId ?? null,
    mode: context.mode,
    selected_drive: context.selectedDrive ?? null,
    title: null,
    prompt_context: context.promptContext ?? null,
    reflection_notes: null,
    started_at: new Date().toISOString(),
    ended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const apiKey = options?.openaiApiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for generation");
  }

  let generated: { title: string; summary: string; content_text: string; medium: ArtifactMedium; content_uri?: string | null; usage?: { prompt_tokens: number; completion_tokens: number } };

  if (options?.registry != null && options.executed_medium != null) {
    const plugin = options.registry.get(options.executed_medium ?? "writing");
    if (!plugin?.generate) {
      throw new Error(`Medium "${options.executed_medium}" has no generator in registry`);
    }
    const result = await plugin.generate({
      mode: context.mode,
      promptContext: context.promptContext,
      sourceContext: context.sourceContext,
      workingContext: context.workingContext,
      openaiApiKey: apiKey,
    });
    generated = result;
  } else {
    const preferImage = context.preferMedium === "image";
    generated = preferImage
      ? await generateImage(
          {
            mode: context.mode,
            promptContext: context.promptContext,
            sourceContext: context.sourceContext,
            workingContext: context.workingContext,
          },
          { apiKey }
        )
      : await generateWriting(
          {
            mode: context.mode,
            preferMedium: context.preferMedium,
            promptContext: context.promptContext,
            sourceContext: context.sourceContext,
            workingContext: context.workingContext,
          },
          { apiKey }
        );
  }

  const medium: ArtifactMedium = generated.medium;
  const contentUri = generated.medium === "image" && "content_uri" in generated ? generated.content_uri : null;
  const tokensUsed =
    "usage" in generated && generated.usage
      ? generated.usage.prompt_tokens + generated.usage.completion_tokens
      : undefined;
  const artifact: Artifact = {
    artifact_id: crypto.randomUUID(),
    project_id: context.projectId ?? null,
    session_id: session.session_id,
    primary_idea_id: context.ideaId ?? null,
    primary_thread_id: context.ideaThreadId ?? null,
    title: generated.title,
    summary: generated.summary || null,
    medium,
    lifecycle_status: "draft",
    current_approval_state: "pending_review",
    current_publication_state: "private",
    content_text: generated.content_text,
    content_uri: contentUri ?? null,
    preview_uri: contentUri ?? null,
    notes: null,
    alignment_score: null,
    emergence_score: null,
    fertility_score: null,
    pull_score: null,
    recurrence_score: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  session.ended_at = new Date().toISOString();

  return { session, artifacts: [artifact], tokensUsed };
}
