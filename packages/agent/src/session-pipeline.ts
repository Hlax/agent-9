/**
 * Session pipeline: start session → load context → generate → critique → evaluate → store.
 * Canon: docs/02_runtime/session_loop.md.
 * Phase G: one real GPT-backed writing/concept path; persistence delegated to callers.
 */

import type {
  Artifact,
  CreativeSession,
  CreativeDrive,
  SessionMode,
  ArtifactMedium,
} from "@twin/core";
import { generateWriting } from "./generate-writing";

export interface SessionContext {
  /** Loaded for session start; identity, recent sessions, threads, etc. */
  identityId?: string;
  projectId?: string;
  mode: SessionMode;
  /** Selected drive for this session (from drive weights). */
  selectedDrive?: CreativeDrive | null;
  promptContext?: string | null;
  /** Optional: retrieved source context for generation (Phase 2 identity seed). */
  sourceContext?: string | null;
}

export interface SessionPipelineResult {
  session: CreativeSession;
  artifacts: Artifact[];
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

  const generated = await generateWriting(
    {
      mode: context.mode,
      promptContext: context.promptContext,
      sourceContext: context.sourceContext,
    },
    { apiKey }
  );

  const medium: ArtifactMedium = generated.medium;
  const artifact: Artifact = {
    artifact_id: crypto.randomUUID(),
    project_id: context.projectId ?? null,
    session_id: session.session_id,
    primary_idea_id: null,
    primary_thread_id: null,
    title: generated.title,
    summary: generated.summary || null,
    medium,
    lifecycle_status: "draft",
    current_approval_state: "pending_review",
    current_publication_state: "private",
    content_text: generated.content_text,
    content_uri: null,
    preview_uri: null,
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

  return { session, artifacts: [artifact] };
}
