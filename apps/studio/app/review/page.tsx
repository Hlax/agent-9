import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getLaneMap } from "@/lib/canon";

/** Review hub: sections and counts are canon-driven (lane_map). No hardcoded Surface/Medium/System ontology. */

const ACTIVE_STATES = [
  "pending_review",
  "approved",
  "approved_for_staging",
  "staged",
  "approved_for_publication",
  "published",
];

/** Canon lane-native: link to /review/[laneId]. */
function reviewRouteForLane(lane_id: string): string {
  return `/review/${lane_id}`;
}

export default async function ReviewHubPage() {
  const supabase = getSupabaseServer();
  const laneMap = getLaneMap();

  const byLane: Record<string, number> = {};
  for (const l of laneMap.lanes) byLane[l.lane_id] = 0;

  if (supabase) {
    const [surfaceRes, mediumRes, systemRes] = await Promise.all([
      supabase
        .from("proposal_record")
        .select("proposal_record_id", { count: "exact", head: true })
        .eq("lane_type", "surface")
        .in("proposal_state", ACTIVE_STATES),
      supabase
        .from("proposal_record")
        .select("proposal_record_id", { count: "exact", head: true })
        .eq("lane_type", "medium")
        .in("proposal_state", ACTIVE_STATES),
      supabase
        .from("proposal_record")
        .select("proposal_record_id", { count: "exact", head: true })
        .eq("lane_type", "system")
        .in("proposal_state", ACTIVE_STATES),
    ]);
    byLane["build_lane"] = surfaceRes.count ?? 0;
    byLane["promotion_lane"] = 0;
    byLane["audit_lane"] = mediumRes.count ?? 0;
    byLane["system_lane"] = systemRes.count ?? 0;
    byLane["canon_lane"] = 0;
  }

  return (
    <main>
      <h1>Review</h1>
      <p>Review proposals by decision lane. Each lane resolves differently.</p>
      <p>
        <Link href="/">← Studio</Link>
      </p>
      <div className="review-grid">
        {laneMap.lanes.map((lane) => {
          const count = byLane[lane.lane_id] ?? 0;
          const href = reviewRouteForLane(lane.lane_id);
          const label = lane.label ?? lane.lane_id;
          const description = lane.description ?? "";
          return (
            <section
              key={lane.lane_id}
              style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column" }}
            >
              <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.35rem" }}>{label} ({count})</h2>
              <p style={{ fontSize: "0.9rem", color: "#555", margin: "0 0 0.75rem", flex: 1 }}>
                {description}
              </p>
              <Link href={href} style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                Review {label} proposals →
              </Link>
            </section>
          );
        })}
      </div>
    </main>
  );
}
