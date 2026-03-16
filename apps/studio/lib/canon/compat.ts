/**
 * Temporary compatibility mapping between canon lane_id and current DB approval_lane enum.
 * DB enum: artifact | surface | system | medium.
 * Canon lanes: build_lane | system_lane | canon_lane | audit_lane | promotion_lane.
 * Use this shim until proposal_record stores canon lane_id (e.g. lane_id TEXT column) and UI is migrated.
 */

/** Current DB/storage lane type (approval_lane enum). */
export type LaneType = "surface" | "medium" | "system";

/** Canon lane_id from lane_map.json. */
export type CanonLaneId =
  | "build_lane"
  | "system_lane"
  | "canon_lane"
  | "audit_lane"
  | "promotion_lane";

const CANON_TO_DB: Record<CanonLaneId, LaneType> = {
  build_lane: "surface",
  system_lane: "system",
  canon_lane: "system",
  audit_lane: "medium",
  promotion_lane: "surface",
};

const DB_TO_CANON: Record<LaneType, CanonLaneId> = {
  surface: "build_lane",
  medium: "audit_lane",
  system: "system_lane",
};

/**
 * Map canon lane_id to DB LaneType for persistence and existing FSM/transition logic.
 */
export function canonLaneToDb(canonLaneId: string): LaneType {
  const mapped = CANON_TO_DB[canonLaneId as CanonLaneId];
  if (mapped) return mapped;
  return "surface";
}

/**
 * Map DB LaneType to canon lane_id for agent_registry lookups (lane_permissions).
 */
export function dbLaneToCanon(laneType: LaneType): CanonLaneId {
  return DB_TO_CANON[laneType];
}

/**
 * All canon lane ids that map to "surface" (stageable in current FSM).
 */
export const STAGEABLE_CANON_LANES: CanonLaneId[] = ["build_lane", "promotion_lane"];

/**
 * Whether this DB lane_type is allowed to transition to staging/public states in current FSM.
 */
export function isStageableLaneType(laneType: LaneType): boolean {
  return laneType === "surface";
}
