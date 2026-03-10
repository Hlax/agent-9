import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { ArtifactActions } from "./artifact-actions";

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
  let list: { artifact_id: string; title: string; summary: string | null; medium: string; current_approval_state: string; current_publication_state: string | null; created_at: string }[] = [];

  if (supabase) {
    let query = supabase
      .from("artifact")
      .select("artifact_id, title, summary, medium, current_approval_state, current_publication_state, created_at")
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
        {list.length === 0 ? (
          <p>
            <em>
              {view === "queue" && "No artifacts in queue. Run a session to generate one."}
              {view === "approved" && "No approved artifacts yet."}
              {view === "archived" && "No archived artifacts."}
            </em>
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
                {(view === "queue" || view === "approved") && (
                  <ArtifactActions
                    artifactId={a.artifact_id}
                    currentState={a.current_approval_state}
                    publicationState={a.current_publication_state}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
