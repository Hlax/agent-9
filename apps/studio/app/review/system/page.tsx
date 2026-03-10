import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { SystemProposalList, SystemProposalTabs } from "./system-proposal-list";
import { MOCK_LAYOUT_ENABLED, mockSystemProposals } from "../mock-layout-data";

export default async function SystemProposalReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === "approved" || params.view === "archived" ? params.view : "pending_review") as "pending_review" | "approved" | "archived";

  let systemCount = 0;
  const supabase = getSupabaseServer();
  if (supabase) {
    const { count } = await supabase
      .from("proposal_record")
      .select("proposal_record_id", { count: "exact", head: true })
      .eq("lane_type", "system")
      .in("proposal_state", ["pending_review", "approved"]);
    systemCount = count ?? 0;
  }
  const showMock = MOCK_LAYOUT_ENABLED && systemCount === 0;

  return (
    <main>
      <h1>System proposals</h1>
      <p>
        Review Twin proposals for system infrastructure. Approve to record; you implement changes.
      </p>
      <p>
        <Link href="/">← Twin</Link>
      </p>
      <SystemProposalTabs view={view} />
      <section>
        <SystemProposalList view={view} />
      </section>

      {showMock && (
        <section style={{ marginTop: "2rem", padding: "1rem", border: "2px dashed #ccc", borderRadius: 8, background: "#fafafa" }} data-mock-layout-preview>
          <p style={{ margin: "0 0 1rem", fontWeight: 600, color: "#b8860b" }}>
            Layout preview (mock — remove before go-live)
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {mockSystemProposals.map((p) => (
              <li key={p.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.5rem" }}>
                <strong>{p.title}</strong>
                <span style={{ fontSize: "0.85rem", color: "#666", marginLeft: "0.5rem" }}>({p.target_type})</span>
                {p.summary && <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#666" }}>{p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}</p>
                {p.proposal_state === "pending_review" && (
                  <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    <button type="button" disabled style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>Approve</button>
                    <button type="button" disabled style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>Reject</button>
                    <button type="button" disabled style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>Ignore</button>
                    <span style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", border: "1px solid #999", borderRadius: 4 }}>View</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
