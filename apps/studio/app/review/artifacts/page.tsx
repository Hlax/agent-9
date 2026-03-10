import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { ArtifactActions } from "./artifact-actions";
import { HumanFeedbackForm } from "./human-feedback-form";
import { MOCK_LAYOUT_ENABLED, mockArtifacts } from "../mock-layout-data";

const VIEWS = [
  { view: "queue", label: "Queue" },
  { view: "approved", label: "Approved" },
  { view: "archived", label: "Archived" },
] as const;

/**
 * Artifact review: Queue (pending/needs_revision), Approved, or Archived.
 */
export default async function ArtifactReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === "approved" || params.view === "archived" ? params.view : "queue") as "queue" | "approved" | "archived";

  const supabase = getSupabaseServer();
  let list: {
    artifact_id: string;
    title: string;
    summary: string | null;
    medium: string;
    current_approval_state: string;
    current_publication_state: string | null;
    created_at: string;
    session_id: string | null;
    content_uri: string | null;
    preview_uri: string | null;
    content_text: string | null;
  }[] = [];

  if (supabase) {
    let query = supabase
      .from("artifact")
      .select("artifact_id, title, summary, medium, current_approval_state, current_publication_state, created_at, session_id, content_uri, preview_uri, content_text")
      .order("created_at", { ascending: false });

    if (view === "approved") {
      query = query.in("current_approval_state", [
        "approved",
        "approved_with_annotation",
        "approved_for_publication",
      ]);
    } else if (view === "archived") {
      query = query.eq("current_approval_state", "archived");
    } else {
      query = query.in("current_approval_state", ["pending_review", "needs_revision"]);
    }

    const { data } = await query;
    list = data ?? [];
  }

  return (
    <main>
      <h1>Artifact review</h1>
      <p>Review generated artifacts. Approval and publication are separate.</p>
      <p>
        <Link href="/">← Twin</Link>
      </p>
      <nav style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
        {VIEWS.map((v) => (
          <Link
            key={v.view}
            href={`/review/artifacts${v.view === "queue" ? "" : `?view=${v.view}`}`}
            style={{ fontWeight: view === v.view ? 600 : 400 }}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <section style={{ marginTop: "1rem" }}>
        {list.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {list.map((a) => (
              <li
                key={a.artifact_id}
                id={`artifact-${a.artifact_id}`}
                style={{
                  border: "1px solid #ddd",
                  padding: "1rem",
                  marginBottom: "0.75rem",
                  borderRadius: 8,
                }}
              >
                {(a.preview_uri ?? a.content_uri) ? (
                  <div style={{ marginBottom: "0.75rem", borderRadius: 6, overflow: "hidden", background: "#f0f0f0" }}>
                    <img src={(a.preview_uri ?? a.content_uri)!} alt="" style={{ display: "block", width: "100%", maxWidth: 320, maxHeight: 240, objectFit: "contain" }} />
                  </div>
                ) : (a.content_text && a.medium !== "image") ? (
                  <div style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "#f9f9f9", borderRadius: 6, fontSize: "0.9rem", maxHeight: 160, overflow: "auto" }}>
                    {(a.content_text ?? "").slice(0, 400)}
                    {(a.content_text?.length ?? 0) > 400 ? "…" : ""}
                  </div>
                ) : null}
                <strong>{a.title}</strong>
                {a.summary && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>
                    {a.summary}
                  </p>
                )}
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                  {a.medium} · {a.current_approval_state} · {a.current_publication_state ?? "private"}
                </p>
                {(view === "queue" || view === "approved") && (
                  <>
                    <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                      {a.session_id && (
                        <a href={`/sessions/${a.session_id}`} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", border: "1px solid #999", borderRadius: 4, background: "#fff", color: "#333", textDecoration: "none" }}>
                          View session
                        </a>
                      )}
                      <a href={a.session_id ? `/sessions/${a.session_id}#artifact-${a.artifact_id}` : "#"} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", border: "1px solid #999", borderRadius: 4, background: "#fff", color: "#333", textDecoration: "none" }}>
                        View artifact
                      </a>
                    </div>
                    <ArtifactActions
                      artifactId={a.artifact_id}
                      currentState={a.current_approval_state}
                      publicationState={a.current_publication_state}
                      medium={a.medium}
                    />
                    <HumanFeedbackForm artifactId={a.artifact_id} />
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : MOCK_LAYOUT_ENABLED && view === "queue" ? (
          <div data-mock-layout-preview style={{ padding: "1rem", border: "2px dashed #ccc", borderRadius: 8, background: "#fafafa" }}>
            <p style={{ margin: "0 0 0.75rem", fontWeight: 600, color: "#b8860b" }}>
              Layout preview (mock — remove before go-live)
            </p>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {mockArtifacts.map((a) => (
                <li
                  key={a.artifact_id}
                  style={{
                    border: "1px solid #ddd",
                    padding: "1rem",
                    marginBottom: "0.75rem",
                    borderRadius: 4,
                  }}
                >
                  <strong>{a.title}</strong>
                  {a.summary && (
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>
                      {a.summary}
                    </p>
                  )}
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                    {a.medium} · {a.current_approval_state} · {a.current_publication_state ?? "private"}
                  </p>
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                    <button type="button" disabled style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}>Approve</button>
                    <button type="button" disabled style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}>Needs revision</button>
                    <button type="button" disabled style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}>Publish</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>
            <em>
              {view === "queue" && "No artifacts in queue. Run a session to generate one."}
              {view === "approved" && "No approved artifacts yet."}
              {view === "archived" && "No archived artifacts."}
            </em>
          </p>
        )}
      </section>
    </main>
  );
}
