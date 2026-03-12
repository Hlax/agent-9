/**
 * Habitat V2 — structured payload schema and validator.
 * Canon: docs/04_product/habitat_v2.md. Allowlisted blocks only; fail closed.
 */
import { z } from "zod";

const MAX_BLOCKS = 24;
const MAX_STRING = 2000;
const MAX_ARTIFACTS_PER_BLOCK = 20;
const MAX_PAYLOAD_BYTES = 50_000;

const toneEnum = z.enum(["calm", "bold", "dreamlike", "editorial", "gallery", "playful"]);
const densityEnum = z.enum(["minimal", "balanced", "immersive"]);
const motionEnum = z.enum(["none", "subtle", "ambient"]);
const surfaceEnum = z.enum(["clean", "soft", "tech", "museum", "poster"]);
const pageEnum = z.enum(["home", "works", "about", "installation"]);
const motifEnum = z.enum(["orbs", "scanlines", "stars", "paper", "signal"]);
const intensityEnum = z.enum(["low", "medium"]);
const alignmentEnum = z.enum(["left", "center"]);
const columnsEnum = z.union([z.literal(2), z.literal(3), z.literal(4)]);

const safeString = z.string().max(MAX_STRING).trim();
/** Artifact/public reference: allow UUID or short id (e.g. artifact_xxx). No URLs. */
const safeIdRef = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);

const HabitatThemeSchema = z.object({
  tone: toneEnum.optional(),
  density: densityEnum.optional(),
  motion: motionEnum.optional(),
  surfaceStyle: surfaceEnum.optional(),
}).strict();

const HeroBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("hero"),
  headline: safeString,
  subheadline: safeString.optional(),
  avatarArtifactId: safeIdRef.optional(),
  alignment: alignmentEnum.optional(),
}).strict();

const TextBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("text"),
  content: safeString,
}).strict();

const QuoteBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("quote"),
  text: safeString,
  attribution: safeString.optional(),
}).strict();

const ArtifactGridBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("artifact_grid"),
  title: safeString.optional(),
  artifactIds: z.array(safeIdRef).max(MAX_ARTIFACTS_PER_BLOCK),
  columns: columnsEnum.optional(),
}).strict();

const FeaturedArtifactBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("featured_artifact"),
  artifactId: safeIdRef,
  caption: safeString.optional(),
}).strict();

const ConceptClusterBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("concept_cluster"),
  title: safeString.optional(),
  artifactIds: z.array(safeIdRef).max(MAX_ARTIFACTS_PER_BLOCK),
}).strict();

const TimelineBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("timeline"),
  title: safeString.optional(),
  artifactIds: z.array(safeIdRef).max(MAX_ARTIFACTS_PER_BLOCK),
}).strict();

const AmbientMotifBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("ambient_motif"),
  motif: motifEnum,
  intensity: intensityEnum.optional(),
}).strict();

const DividerBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("divider"),
}).strict();

const MarqueeBlockSchema = z.object({
  id: safeIdRef,
  type: z.literal("marquee"),
  title: safeString.optional(),
  artifactIds: z.array(safeIdRef).max(MAX_ARTIFACTS_PER_BLOCK),
}).strict();

const HabitatBlockSchema = z.discriminatedUnion("type", [
  HeroBlockSchema,
  TextBlockSchema,
  QuoteBlockSchema,
  ArtifactGridBlockSchema,
  FeaturedArtifactBlockSchema,
  ConceptClusterBlockSchema,
  TimelineBlockSchema,
  AmbientMotifBlockSchema,
  DividerBlockSchema,
  MarqueeBlockSchema,
]);

export const HabitatProposalPayloadSchema = z.object({
  version: z.literal(1),
  page: pageEnum,
  theme: HabitatThemeSchema.optional(),
  blocks: z.array(HabitatBlockSchema).max(MAX_BLOCKS),
}).strict();

export type HabitatProposalPayload = z.infer<typeof HabitatProposalPayloadSchema>;
export type HabitatTheme = z.infer<typeof HabitatThemeSchema>;
export type HabitatBlock = z.infer<typeof HabitatBlockSchema>;

export type HeroBlock = z.infer<typeof HeroBlockSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type QuoteBlock = z.infer<typeof QuoteBlockSchema>;
export type ArtifactGridBlock = z.infer<typeof ArtifactGridBlockSchema>;
export type FeaturedArtifactBlock = z.infer<typeof FeaturedArtifactBlockSchema>;
export type ConceptClusterBlock = z.infer<typeof ConceptClusterBlockSchema>;
export type TimelineBlock = z.infer<typeof TimelineBlockSchema>;
export type AmbientMotifBlock = z.infer<typeof AmbientMotifBlockSchema>;
export type DividerBlock = z.infer<typeof DividerBlockSchema>;
export type MarqueeBlock = z.infer<typeof MarqueeBlockSchema>;

export type ValidateHabitatPayloadResult =
  | { success: true; data: HabitatProposalPayload }
  | { success: false; error: string };

/**
 * Validate a habitat proposal payload. Rejects unknown blocks, extra fields, oversized payload.
 * Does not check artifact IDs against DB (caller must ensure only approved public artifact IDs).
 */
export function validateHabitatPayload(
  raw: unknown,
  options?: { maxBytes?: number }
): ValidateHabitatPayloadResult {
  const maxBytes = options?.maxBytes ?? MAX_PAYLOAD_BYTES;
  if (typeof raw !== "object" || raw === null) {
    return { success: false, error: "Payload must be an object" };
  }
  const str = JSON.stringify(raw);
  if (str.length > maxBytes) {
    return { success: false, error: `Payload exceeds ${maxBytes} bytes` };
  }
  const parsed = HabitatProposalPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.path.join(".") + ": " + e.message).join("; ");
    return { success: false, error: msg };
  }
  return { success: true, data: parsed.data };
}

/**
 * Minimal merge-time payload shape: page (string slug), blocks (array). Used when full schema
 * validation fails but payload is mergeable (e.g. version as string, or extra block fields).
 */
const MIN_MERGE_PAYLOAD_BYTES = 50_000;

export function parseHabitatPayloadForMerge(raw: unknown): { slug: string; payload: object } | { error: string } {
  if (raw === null || raw === undefined) {
    return { error: "Payload is null or undefined" };
  }
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return { error: "Payload string is not valid JSON" };
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { error: "Payload must be an object" };
  }
  const o = obj as Record<string, unknown>;
  const page = o.page;
  if (typeof page !== "string" || page.trim() === "") {
    return { error: "Payload must have a non-empty string 'page' (slug)" };
  }
  const blocks = o.blocks;
  if (!Array.isArray(blocks)) {
    return { error: "Payload must have a 'blocks' array" };
  }
  const str = JSON.stringify(obj);
  if (str.length > MIN_MERGE_PAYLOAD_BYTES) {
    return { error: `Payload exceeds ${MIN_MERGE_PAYLOAD_BYTES} bytes` };
  }
  const slug = page.trim();
  const payload: object = { ...o, page: slug } as object;
  return { slug, payload };
}

/** Collect all artifact IDs referenced in a payload (for validation against approved/public set). */
export function collectArtifactIdsFromPayload(payload: HabitatProposalPayload): string[] {
  const ids: string[] = [];
  for (const block of payload.blocks) {
    if ("avatarArtifactId" in block && block.avatarArtifactId) ids.push(block.avatarArtifactId);
    if ("artifactId" in block && block.artifactId) ids.push(block.artifactId);
    if ("artifactIds" in block && Array.isArray(block.artifactIds)) ids.push(...block.artifactIds);
  }
  return [...new Set(ids)];
}

const MAX_SUMMARY_WORDS = 200;

/** Cap a string to at most 200 words (by whitespace). */
export function capSummaryTo200Words(text: string | null | undefined): string {
  if (text == null || !String(text).trim()) return "";
  const words = String(text).trim().split(/\s+/);
  return words.slice(0, MAX_SUMMARY_WORDS).join(" ");
}

/**
 * Produce a short summary (≤200 words) describing the habitat payload for proposal display.
 */
export function summaryFromHabitatPayload(payload: HabitatProposalPayload): string {
  const parts: string[] = [];
  parts.push(`Page: ${payload.page}.`);
  if (payload.theme) {
    const t = payload.theme;
    const tokens = [t.tone, t.density, t.motion, t.surfaceStyle].filter(Boolean);
    if (tokens.length) parts.push(`Theme: ${tokens.join(", ")}.`);
  }
  const blockTypes = [...new Set(payload.blocks.map((b) => b.type))];
  parts.push(`Blocks: ${blockTypes.join(", ")} (${payload.blocks.length} total).`);
  return capSummaryTo200Words(parts.join(" "));
}

/** Safe truncation for headline/subheadline (max length for schema). */
function truncateSafe(s: string | null | undefined, max: number): string {
  if (s == null) return "";
  const t = String(s).trim().slice(0, max);
  return t;
}

/**
 * Build a minimal valid Habitat V2 payload from a concept (title/summary).
 * No artifact refs — safe to publish without artifact checks. Used so session-run proposals are publishable.
 */
export function buildMinimalHabitatPayloadFromConcept(
  title: string | null | undefined,
  summary: string | null | undefined
): HabitatProposalPayload {
  const headline = truncateSafe(title, 500) || "New concept";
  const subheadline = truncateSafe(summary, 1000) || undefined;
  return {
    version: 1,
    page: "home",
    blocks: [
      {
        id: "hero_1",
        type: "hero",
        headline,
        ...(subheadline ? { subheadline } : {}),
        alignment: "center",
      },
    ],
  };
}
