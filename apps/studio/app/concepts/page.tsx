import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * Concept artifacts: list artifacts with medium = 'concept'.
 * Canon: concept is an artifact type for structured creative thinking (habitat direction, naming, etc.).
 */
export default async function ConceptsPage() {
  const supabase = getSupabaseServer();
  const artifacts =
    supabase &&
    (
      await supabase
        .from("artifact")
        .select("artifact_id, title, summary, content_text, session_id, created_at")
        .eq("medium", "concept")
        .order("created_at", { ascending: false })
        .limit(100)
    ).data;

  const list = artifacts ?? [];

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p>
        <Link href="/">← Studio</Link> · <Link href="/session">Session</Link> · <Link href="/review/artifacts">Artifact review</Link>
      </p>
      <h1>Concept artifacts</h1>
      <p>
        Structured creative thinking: naming, aesthetic direction, habitat concepts, story seeds. Run a session with &quot;Concept (reflect)&quot; to generate one.
      </p>
      <section style={{ marginTop: "1.5rem" }}>
        {list.length === 0 ? (
          <p>
            <em>No concept artifacts yet. Start a session and choose &quot;Concept (reflect)&quot; to create one.</em>
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {list.map(
              (a: {
                artifact_id: string;
                title: string;
                summary: string | null;
                content_text: string | null;
                session_id: string | null;
                created_at: string;
              }) => (
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
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </li>
              )
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
