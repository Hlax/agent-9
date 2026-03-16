/**
 * Canon loader: reads canon JSON files from disk, validates with Zod, caches in memory.
 * Server-only. Do not import from client components.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  SystemOntologySchema,
  AgentRegistrySchema,
  ProposalTypesSchema,
  LaneMapSchema,
  GovernanceRulesSchema,
  PromotionRulesSchema,
  BlockConditionsSchema,
  type SystemOntology,
  type AgentRegistry,
  type ProposalTypes,
  type LaneMap,
  type GovernanceRules,
  type PromotionRules,
  type BlockConditions,
} from "./schemas";

export type Canon = {
  systemOntology: SystemOntology;
  agentRegistry: AgentRegistry;
  proposalTypes: ProposalTypes;
  laneMap: LaneMap;
  governanceRules: GovernanceRules;
  promotionRules: PromotionRules;
  blockConditions: BlockConditions;
};

function getCanonRoot(): string {
  const env = process.env.CANON_ROOT;
  if (env) return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  const candidates = [
    path.resolve(process.cwd(), "canon"),
    path.resolve(process.cwd(), "..", "canon"),
    path.resolve(process.cwd(), "..", "..", "canon"),
  ];
  for (const dir of candidates) {
    const coreDir = path.join(dir, "core", "proposal_types.json");
    if (fs.existsSync(coreDir)) return dir;
  }
  return path.resolve(process.cwd(), "canon");
}

function readJsonFile<T>(filePath: string, schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown } }): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const message = result.error instanceof Error
      ? result.error.message
      : String(result.error);
    throw new Error(`Canon validation failed for ${filePath}: ${message}`);
  }
  return result.data;
}

let cached: Canon | null = null;

/**
 * Load all canon files from disk, validate, and return. Results are cached.
 * Call from server context only (API routes, server components, server actions).
 */
export function loadCanon(root?: string): Canon {
  if (cached) return cached;
  const base = root ?? getCanonRoot();

  const systemOntology = readJsonFile(path.join(base, "core", "system_ontology.json"), SystemOntologySchema);
  const agentRegistry = readJsonFile(path.join(base, "core", "agent_registry.json"), AgentRegistrySchema);
  const proposalTypes = readJsonFile(path.join(base, "core", "proposal_types.json"), ProposalTypesSchema);
  const laneMap = readJsonFile(path.join(base, "core", "lane_map.json"), LaneMapSchema);
  const governanceRules = readJsonFile(path.join(base, "governance", "governance_rules.json"), GovernanceRulesSchema);
  const promotionRules = readJsonFile(path.join(base, "governance", "promotion_rules.json"), PromotionRulesSchema);
  const blockConditions = readJsonFile(path.join(base, "governance", "block_conditions.json"), BlockConditionsSchema);

  cached = {
    systemOntology,
    agentRegistry,
    proposalTypes,
    laneMap,
    governanceRules,
    promotionRules,
    blockConditions,
  };
  return cached;
}

/**
 * Return cached canon or load from disk. Use this in application code.
 */
export function getCanon(): Canon {
  return loadCanon();
}

/**
 * Clear in-memory cache. Useful for tests or when canon files change (e.g. dev reload).
 */
export function clearCanonCache(): void {
  cached = null;
}

/** Convenience getters (read from cached canon). */
export function getProposalTypes(): ProposalTypes {
  return getCanon().proposalTypes;
}

export function getLaneMap(): LaneMap {
  return getCanon().laneMap;
}

export function getAgentRegistry(): AgentRegistry {
  return getCanon().agentRegistry;
}

export function getGovernanceRules(): GovernanceRules {
  return getCanon().governanceRules;
}

export function getPromotionRules(): PromotionRules {
  return getCanon().promotionRules;
}

export function getBlockConditions(): BlockConditions {
  return getCanon().blockConditions;
}

/**
 * Look up a proposal type by id. Returns undefined if not found.
 */
export function getProposalType(proposalTypeId: string): ProposalTypes["proposal_types"][number] | undefined {
  return getProposalTypes().proposal_types.find((p) => p.proposal_type === proposalTypeId);
}

/**
 * Look up primary_lane for a proposal type. Returns undefined if proposal type not in canon.
 */
export function getPrimaryLaneForProposalType(proposalTypeId: string): string | undefined {
  return getProposalType(proposalTypeId)?.primary_lane;
}

/**
 * Validate that a string is a known proposal type in canon. Returns true if valid.
 */
export function isValidProposalType(proposalTypeId: string): boolean {
  return getProposalType(proposalTypeId) !== undefined;
}

/**
 * Look up an agent by agent_id. Returns undefined if not found.
 */
export function getAgent(agentId: string): AgentRegistry["agents"][number] | undefined {
  return getAgentRegistry().agents.find((a) => a.agent_id === agentId);
}

/**
 * Check whether an agent has permission to create proposals in the given canon lane.
 * Returns true if agent has lane in lane_permissions and "create_proposal" (or create_system_proposal etc.) in allowed_actions, and not in restricted_actions.
 */
export function agentCanCreateProposalInLane(agentId: string, canonLaneId: string): boolean {
  const agent = getAgent(agentId);
  if (!agent) return false;
  if (agent.lifecycle_status !== "active") return false;
  if (!agent.lane_permissions.includes(canonLaneId)) return false;
  const hasCreate =
    agent.allowed_actions.includes("create_proposal") ||
    agent.allowed_actions.includes("create_system_proposal") ||
    agent.allowed_actions.includes("create_agent_proposal") ||
    agent.allowed_actions.includes("create_canon_proposal");
  if (!hasCreate) return false;
  if (agent.restricted_actions.includes("create_proposal")) return false;
  return true;
}
