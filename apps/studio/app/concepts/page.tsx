import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { ConceptProposalActions } from "./concept-proposal-actions";

const VIEWS = [
  { view: "queue", label: "Queue" },
  { view: "approved", label: "Approved" },
  { view: "archived", label: "Archived" },
] as const;

/**
 * Concept artifacts: list by approval view (queue = pending/needs_revision, approved, archived).
 */
export default async function ConceptsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === "approved" || params.view === "archived" ? params.view : "queue") as "queue" | "approved" | "archived";

  const supabase = getSupabaseServer();
  let list: { artifact_id: string; title: string; summary: string | null; content_text: string | null; session_id: string | null; created_at: string; current_approval_state: string | null }[] = [];

  if (supabase) {
    let query = supabase
      .from("artifact")
      .select("artifact_id, title, summary, content_text, session_id, created_at, current_approval_state")
      .eq("medium", "concept")
      .order("created_at", { ascending: false })
      .limit(100);

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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p>
        <Link href="/">← Twin</Link> · <Link href="/session">Session</Link> · <Link href="/review/artifacts">Artifact review</Link> · <Link href="/review/surface">Surface</Link>
      </p>
      <h1>Concept artifacts</h1>
      <p>
        Structured creative thinking: naming, aesthetic direction, habitat concepts, story seeds.
      </p>
      <nav style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
        {VIEWS.map((v) => (
          <Link
            key={v.view}
            href={`/concepts${v.view === "queue" ? "" : `?view=${v.view}`}`}
            style={{ fontWeight: view === v.view ? 600 : 400 }}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <section style={{ marginTop: "1.5rem" }}>
        {list.length === 0 ? (
          <p>
            <em>
              {view === "queue" && "No concept artifacts in queue. Run a session with Concept (reflect) to create one."}
              {view === "approved" && "No approved concepts yet."}
              {view === "archived" && "No archived concepts."}
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <strong>{a.title}</strong>
                  <span className="lane-badge">Surface</span>
                </span>
                {a.summary && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>
                    {a.summary}
                  </p>
                )}
                {a.content_text && (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                    {a.content_text.slice(0, 500)}
                    {a.content_text.length > 500 ? "…" : ""}
                  </p>
                )}
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
                  {a.session_id ? (
                    <Link href={`/sessions/${a.session_id}`}>View session</Link>
                  ) : null}
                  {" · "}
                  {a.current_approval_state ?? "—"} · {new Date(a.created_at).toLocaleString()}
                </p>
                <ConceptProposalActions artifactId={a.artifact_id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
