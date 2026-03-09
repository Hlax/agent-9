import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { AddSourceItemForm } from "./add-source-item-form";

/**
 * Source library: identity seed and reference items used as session context.
 * Canon: docs/05_build/identity_seed_ingestion.md, source_library_ingest.md.
 */
export default async function SourceLibraryPage() {
  const supabase = getSupabaseServer();
  const items =
    supabase &&
    (
      await supabase
        .from("source_item")
        .select("source_item_id, title, source_type, summary, content_text, ingested_at, created_at")
        .order("ingested_at", { ascending: false })
        .limit(100)
    ).data;

  const list = items ?? [];

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p>
        <Link href="/">← Studio</Link> · <Link href="/session">Session</Link>
      </p>
      <h1>Source library (brain context)</h1>
      <p>
        Identity seed and reference items are retrieved when you run a session and passed into generation as context.
        Add items below; tag as <strong>identity_seed</strong> or <strong>reference</strong>.
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Add source item</h2>
        <AddSourceItemForm />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Items ({list.length})</h2>
        {list.length === 0 ? (
          <p>
            <em>No source items yet. Add one above to seed the brain.</em>
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {(list as Array<{
              source_item_id: string;
              title: string;
              source_type: string;
              summary: string | null;
              content_text: string | null;
              ingested_at: string;
              created_at: string;
            }>).map((item) => (
              <li
                key={item.source_item_id}
                style={{
                  border: "1px solid #eee",
                  padding: "0.75rem 1rem",
                  marginBottom: "0.5rem",
                  borderRadius: 4,
                }}
              >
                <strong>{item.title}</strong>
                <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "#666" }}>
                  [{item.source_type}]
                </span>
                {item.summary && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#444" }}>
                    {item.summary.slice(0, 200)}
                    {item.summary.length > 200 ? "…" : ""}
                  </p>
                )}
                {item.content_text && !item.summary && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#444" }}>
                    {item.content_text.slice(0, 200)}
                    {item.content_text.length > 200 ? "…" : ""}
                  </p>
                )}
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#999" }}>
                  {new Date(item.ingested_at ?? item.created_at).toISOString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
