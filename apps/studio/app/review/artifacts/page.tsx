import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { ArtifactActions } from "./artifact-actions";

/**
 * Artifact review queue.
 * Canon: artifact lane — approve, approve_with_annotation, needs_revision, reject, archive, approve_for_publication.
 * Publication is separate.
 */
export default async function ArtifactReviewPage() {
  const supabase = getSupabaseServer();
  const artifacts =
    supabase &&
    (
      await supabase
        .from("artifact")
        .select(
          "artifact_id, title, summary, medium, current_approval_state, current_publication_state, created_at"
        )
        .in("current_approval_state", ["pending_review", "needs_revision"])
        .order("created_at", { ascending: false })
    ).data;

  const list = artifacts ?? [];

  return (
    <main>
      <h1>Artifact review queue</h1>
      <p>Review generated artifacts. Approval and publication are separate.</p>
      <p>
        <Link href="/">← Studio</Link>
      </p>
      <section style={{ marginTop: "1rem" }}>
        {list.length === 0 ? (
          <p>
            <em>No artifacts in queue. Run a session from Studio to generate one.</em>
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {list.map((a) => (
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
                <ArtifactActions
                  artifactId={a.artifact_id}
                  currentState={a.current_approval_state}
                  publicationState={a.current_publication_state}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
