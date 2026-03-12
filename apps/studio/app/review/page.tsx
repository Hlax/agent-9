import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";

const SURFACE_ACTIVE_STATES = [
  "pending_review",
  "approved",
  "approved_for_staging",
  "staged",
  "approved_for_publication",
  "published",
];
const MEDIUM_SYSTEM_ACTIVE_STATES = ["pending_review", "approved"];

export default async function ReviewHubPage() {
  const supabase = getSupabaseServer();
  let surfaceCount = 0;
  let mediumCount = 0;
  let systemCount = 0;
  if (supabase) {
    const [surfaceRes, mediumRes, systemRes] = await Promise.all([
      supabase
        .from("proposal_record")
        .select("proposal_record_id", { count: "exact", head: true })
        .eq("lane_type", "surface")
        .in("proposal_state", SURFACE_ACTIVE_STATES),
      supabase
        .from("proposal_record")
        .select("proposal_record_id", { count: "exact", head: true })
        .eq("lane_type", "medium")
        .in("proposal_state", MEDIUM_SYSTEM_ACTIVE_STATES),
      supabase
        .from("proposal_record")
        .select("proposal_record_id", { count: "exact", head: true })
        .eq("lane_type", "system")
        .in("proposal_state", MEDIUM_SYSTEM_ACTIVE_STATES),
    ]);
    surfaceCount = surfaceRes.count ?? 0;
    mediumCount = mediumRes.count ?? 0;
    systemCount = systemRes.count ?? 0;
  }

  return (
    <main>
      <h1>Review</h1>
      <p>Review proposals by decision lane. Each lane resolves differently.</p>
      <p>
        <Link href="/">← Twin</Link>
      </p>
      <div className="review-grid">
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.35rem" }}>Surface lane ({surfaceCount})</h2>
          <p style={{ fontSize: "0.9rem", color: "#555", margin: "0 0 0.75rem", flex: 1 }}>
            User-facing content and habitat experiences. Surface proposals can move into staging and, after review, to public.
          </p>
          <p style={{ fontSize: "0.8rem", color: "#666", margin: "0 0 0.75rem" }}>
            <strong>Resolution:</strong> staging → public (via human-controlled release).
          </p>
          <Link href="/review/surface" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            Review surface proposals →
          </Link>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.35rem" }}>Medium lane ({mediumCount})</h2>
          <p style={{ fontSize: "0.9rem", color: "#555", margin: "0 0 0.75rem", flex: 1 }}>
            Capability and medium proposals (e.g. extensions). These do not go to staging or public directly; they feed the roadmap and specs.
          </p>
          <p style={{ fontSize: "0.8rem", color: "#666", margin: "0 0 0.75rem" }}>
            <strong>Resolution:</strong> governance review → roadmap / specification / later implementation.
          </p>
          <Link href="/review/medium" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            Review medium proposals →
          </Link>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.35rem" }}>System lane ({systemCount})</h2>
          <p style={{ fontSize: "0.9rem", color: "#555", margin: "0 0 0.75rem", flex: 1 }}>
            Platform, runtime, and governance changes. Approving a system proposal records a decision; it is not a content publish action.
          </p>
          <p style={{ fontSize: "0.8rem", color: "#666", margin: "0 0 0.75rem" }}>
            <strong>Resolution:</strong> human governance review → approved/rejected → later implementation.
          </p>
          <Link href="/review/system" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            Review system proposals →
          </Link>
        </section>
      </div>
    </main>
  );
}

