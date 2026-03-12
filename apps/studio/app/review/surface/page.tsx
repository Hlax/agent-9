import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { MOCK_LAYOUT_ENABLED, mockNameProposals, mockHabitatProposals, mockAvatarProposals } from "../mock-layout-data";

/**
 * Surface proposal review queue stub.
 * Canon: surface lane — avatar candidates and public habitat proposals are first-class reviewable flows.
 * Do not collapse with artifact approval; use proposal_record with lane_type = surface.
 * Mock layout hides when any surface proposal exists (pending or approved).
 */
export default async function SurfaceReviewPage() {
  let surfaceCount = 0;
  const supabase = getSupabaseServer();
  if (supabase) {
    const { count } = await supabase
      .from("proposal_record")
      .select("proposal_record_id", { count: "exact", head: true })
      .eq("lane_type", "surface")
      .in("proposal_state", ["pending_review", "approved", "approved_for_staging", "staged", "approved_for_publication", "published"]);
    surfaceCount = count ?? 0;
  }
  const showMock = MOCK_LAYOUT_ENABLED && surfaceCount === 0;

  return (
    <main>
      <h1>Surface proposals</h1>
      <p>
        Review name, habitat, and avatar proposals in the <strong>surface lane</strong>. These are user-facing experiences that can move into staging and, after review, to public.
        Separate from artifact approval; this is the content/staging/public path.
      </p>
      <p>
        <Link href="/review">← Review</Link>
      </p>

      <div className="surface-grid">
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.35rem" }}>Name proposals</h2>
          <p style={{ fontSize: "0.9rem", color: "#555", margin: "0 0 0.75rem", flex: 1 }}>
            Twin-proposed identity names in the surface lane. Apply to set the canonical public name.
          </p>
          <Link href="/review/surface/name" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            Review name proposals →
          </Link>
          {showMock && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed #ccc" }} data-mock-layout-preview>
              <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "#b8860b", fontSize: "0.85rem" }}>Mock</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {mockNameProposals.map((p) => (
                  <li key={p.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: "0.6rem", marginBottom: "0.4rem", fontSize: "0.85rem" }}>
                    <strong>{p.title}</strong>
                    {p.summary && <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>{p.summary}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.35rem" }}>Habitat proposals</h2>
          <p style={{ fontSize: "0.9rem", color: "#555", margin: "0 0 0.75rem", flex: 1 }}>
            Public habitat layout and content. Approve for <strong>staging</strong>, then push staging to public when ready.
          </p>
          <Link href="/review/surface/habitat" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            Review habitat proposals →
          </Link>
          {showMock && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed #ccc" }} data-mock-layout-preview>
              <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "#b8860b", fontSize: "0.85rem" }}>Mock</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {mockHabitatProposals.map((p) => (
                  <li key={p.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: "0.6rem", marginBottom: "0.4rem", fontSize: "0.85rem" }}>
                    <strong>{p.title}</strong>
                    {p.summary && <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>{p.summary}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.35rem" }}>Avatar candidates</h2>
          <p style={{ fontSize: "0.9rem", color: "#555", margin: "0 0 0.75rem", flex: 1 }}>
            Avatar or identity mark proposals in the surface lane. Approve to set embodiment direction (governs how the Twin appears).
          </p>
          <Link href="/review/surface/avatar" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            Review avatar proposals →
          </Link>
          {showMock && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed #ccc" }} data-mock-layout-preview>
              <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "#b8860b", fontSize: "0.85rem" }}>Mock</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {mockAvatarProposals.map((p) => (
                  <li key={p.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: "0.6rem", marginBottom: "0.4rem", fontSize: "0.85rem" }}>
                    <strong>{p.title}</strong>
                    {p.summary && <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>{p.summary}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
