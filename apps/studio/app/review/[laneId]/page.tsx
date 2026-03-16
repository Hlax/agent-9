import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaneMap, canonLaneToDb } from "@/lib/canon";
import { getSupabaseServer } from "@/lib/supabase-server";

const ACTIVE_STATES = [
  "pending_review",
  "approved",
  "approved_for_staging",
  "staged",
  "approved_for_publication",
  "published",
];

/** Compatibility: segment "surface" | "medium" | "system" → canon lane_id. */
const SEGMENT_TO_CANON: Record<string, string> = {
  surface: "build_lane",
  medium: "audit_lane",
  system: "system_lane",
};

/**
 * Canon lane-native review page. /review/[laneId] where laneId is from canon (build_lane, system_lane, audit_lane, promotion_lane, canon_lane).
 * Compatibility: /review/surface, /review/medium, /review/system resolve to build_lane, audit_lane, system_lane.
 */
export default async function LaneReviewPage({
  params,
}: {
  params: Promise<{ laneId: string }>;
}) {
  const { laneId: segment } = await params;
  const laneId = SEGMENT_TO_CANON[segment] ?? segment;

  const laneMap = getLaneMap();
  const lane = laneMap.lanes.find((l) => l.lane_id === laneId);
  if (!lane) notFound();

  const dbLaneType = canonLaneToDb(laneId);
  let proposals: Array<{ proposal_record_id: string; title: string | null; summary: string | null; proposal_state: string }> = [];
  const supabase = getSupabaseServer();
  if (supabase) {
    const { data } = await supabase
      .from("proposal_record")
      .select("proposal_record_id, title, summary, proposal_state")
      .eq("lane_type", dbLaneType)
      .in("proposal_state", ACTIVE_STATES)
      .order("created_at", { ascending: false })
      .limit(100);
    proposals = (data ?? []) as typeof proposals;
  }

  const label = lane.label ?? lane.lane_id;
  const description = lane.description ?? "";

  return (
    <main>
      <h1>{label}</h1>
      <p>{description}</p>
      <p>
        <Link href="/review">← Review</Link>
      </p>
      <p style={{ fontSize: "0.9rem", color: "#555" }}>
        {proposals.length} proposal{proposals.length !== 1 ? "s" : ""} in this lane.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0" }}>
        {proposals.map((p) => (
          <li
            key={p.proposal_record_id}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem", marginBottom: "0.5rem" }}
          >
            <Link href={`/review/proposals/${p.proposal_record_id}`} style={{ fontWeight: 600 }}>
              {p.title ?? "Untitled"}
            </Link>
            {p.summary && (
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", color: "#555" }}>{p.summary.slice(0, 200)}{p.summary.length > 200 ? "…" : ""}</p>
            )}
            <span style={{ fontSize: "0.8rem", color: "#888" }}> {p.proposal_state}</span>
          </li>
        ))}
      </ul>
      {proposals.length === 0 && (
        <p style={{ color: "#666", marginTop: "1rem" }}>No proposals in this lane.</p>
      )}
    </main>
  );
}
