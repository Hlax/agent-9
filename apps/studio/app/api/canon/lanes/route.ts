import { NextResponse } from "next/server";
import { getLaneMap, STAGEABLE_CANON_LANES } from "@/lib/canon";

/**
 * GET /api/canon/lanes — canon lane map and stageability.
 * Source of truth for lane_id, labels, descriptions, and which lanes are stageable.
 * Used by review hub, staging UI, and any client that needs to render lanes dynamically.
 */
export async function GET() {
  try {
    const laneMap = getLaneMap();
    const stageableSet = new Set<string>(STAGEABLE_CANON_LANES);
    const lanes = laneMap.lanes.map((l) => ({
      lane_id: l.lane_id,
      label: l.label ?? l.lane_id,
      description: l.description ?? null,
      stageable: stageableSet.has(l.lane_id),
    }));
    return NextResponse.json({
      version: laneMap.version,
      lanes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load canon lanes." },
      { status: 500 }
    );
  }
}
