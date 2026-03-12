/**
 * Medium plugin and registry types.
 * Canon: docs/architecture/medium_plugin_refactor_plan.md.
 */

import type { SessionMode } from "@twin/core";

export interface MediumPluginCapabilities {
  can_generate: boolean;
  can_propose_surface: boolean;
  can_postprocess: boolean;
  can_upload: boolean;
  supports_staging_target: boolean;
}

export type MediumPluginStatus = "active" | "proposal_only" | "disabled";

export type FallbackReason =
  | "unregistered"
  | "proposal_only"
  | "disabled"
  | "missing_capability"
  | "governance_blocked"
  | "unsupported_by_runtime";

export type ResolutionSource =
  | "derivation"
  | "fallback_rule"
  | "registry_constraint"
  | "manual_override";

/** Phase 2: capability-fit from critique. supported | partial | unsupported. */
export type MediumFit = "supported" | "partial" | "unsupported";

/** Phase 2: closed enum for extension classification; not freeform. */
export type ExtensionClassification =
  | "medium_extension"
  | "toolchain_extension"
  | "workflow_extension"
  | "surface_environment_extension"
  | "system_capability_extension"
  | null;

/**
 * Phase 2: controlled vocabulary for missing_capability.
 * Use this union (not freeform string) so Phase 3 analytics and proposal routing stay clean.
 * Classifier may only use a subset initially; extend as new capability gaps are identified.
 */
export type MissingCapabilityKey =
  | "interactive_ui"
  | "stateful_surface"
  | "video_generation"
  | "audio_rendering"
  | "code_execution"
  | "structured_patch_application"
  | null;

/** Context passed into plugin.generate(). */
export interface MediumGenerationContext {
  mode: SessionMode;
  promptContext?: string | null;
  sourceContext?: string | null;
  workingContext?: string | null;
  /** Injected by pipeline/runner for OpenAI calls. */
  openaiApiKey?: string | null;
}

/** Shape returned by plugin.generate(); pipeline maps this to full Artifact. */
export interface GeneratedArtifact {
  title: string;
  summary: string;
  content_text: string;
  medium: "writing" | "concept" | "image";
  content_uri?: string | null;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Minimal medium plugin interface.
 * Plugins implement generate (and optionally postProcess) and declare status/capabilities.
 */
export interface MediumPlugin {
  id: string;
  label: string;
  status: MediumPluginStatus;
  capabilities: MediumPluginCapabilities;
  canDeriveFromState?: boolean;
  generate?(context: MediumGenerationContext): Promise<GeneratedArtifact>;
  /** After generation; e.g. image → storage. Supabase client from runner. */
  postProcess?(artifact: unknown, supabase: unknown): Promise<unknown | null>;
  proposalRole?: string;
  targetSurface?: string;
  proposalCapKey?: string;
}
