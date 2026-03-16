/**
 * Zod schemas for canon JSON files. Server-only; do not import from client.
 */

import { z } from "zod";

const ObjectTypeSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
});

export const SystemOntologySchema = z.object({
  version: z.string(),
  system_name: z.string().optional(),
  description: z.string().optional(),
  object_types: z.array(ObjectTypeSchema),
  principles: z.array(z.string()).optional(),
});

export const AgentEntrySchema = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  agent_role: z.string(),
  agent_description: z.string().optional(),
  lifecycle_status: z.string(),
  authority_scopes: z.array(z.string()),
  lane_permissions: z.array(z.string()),
  allowed_actions: z.array(z.string()),
  restricted_actions: z.array(z.string()),
  invocation_modes: z.array(z.string()).optional(),
  configuration: z.record(z.unknown()).optional(),
});

export const AgentRegistrySchema = z.object({
  version: z.string(),
  registry_policy: z.record(z.unknown()).optional(),
  agents: z.array(AgentEntrySchema),
});

export const ProposalTypeEntrySchema = z.object({
  proposal_type: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  primary_lane: z.string(),
  auto_build_allowed: z.boolean(),
  requires_human_prebuild_approval: z.boolean(),
  requires_canon_check: z.boolean(),
  requires_final_human_activation: z.boolean(),
  required_fields: z.array(z.string()).optional(),
});

export const ProposalTypesSchema = z.object({
  version: z.string(),
  proposal_types: z.array(ProposalTypeEntrySchema),
});

export const LaneEntrySchema = z.object({
  lane_id: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
});

export const LaneMapSchema = z.object({
  version: z.string(),
  lanes: z.array(LaneEntrySchema),
});

export const GovernanceRuleEntrySchema = z.object({
  rule_id: z.string(),
  category: z.string().optional(),
  description: z.string(),
});

export const GovernanceRulesSchema = z.object({
  version: z.string(),
  rules: z.array(GovernanceRuleEntrySchema),
});

export const PromotionRulesSchema = z.object({
  version: z.string(),
  promotion_requirements: z.array(z.string()),
  promotion_defaults: z.record(z.unknown()).optional(),
});

export const BlockConditionEntrySchema = z.object({
  block_id: z.string(),
  description: z.string(),
});

export const BlockConditionsSchema = z.object({
  version: z.string(),
  block_conditions: z.array(BlockConditionEntrySchema),
});

export type SystemOntology = z.infer<typeof SystemOntologySchema>;
export type AgentEntry = z.infer<typeof AgentEntrySchema>;
export type AgentRegistry = z.infer<typeof AgentRegistrySchema>;
export type ProposalTypeEntry = z.infer<typeof ProposalTypeEntrySchema>;
export type ProposalTypes = z.infer<typeof ProposalTypesSchema>;
export type LaneEntry = z.infer<typeof LaneEntrySchema>;
export type LaneMap = z.infer<typeof LaneMapSchema>;
export type GovernanceRules = z.infer<typeof GovernanceRulesSchema>;
export type PromotionRules = z.infer<typeof PromotionRulesSchema>;
export type BlockConditions = z.infer<typeof BlockConditionsSchema>;
