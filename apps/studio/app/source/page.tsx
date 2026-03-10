import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { AddSourceItemForm } from "./add-source-item-form";
import { ImportFromUrlForm } from "./import-from-url-form";
import { UploadDocForm } from "./upload-doc-form";

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
        .select("source_item_id, title, source_type, source_role, summary, content_text, ingested_at, created_at, tags, identity_relevance_notes, identity_weight, media_kind, origin_reference")
        .order("ingested_at", { ascending: false })
        .limit(100)
    ).data;

  const list = items ?? [];

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p>
        <Link href="/">← Twin</Link> · <Link href="/identity">Identity</Link> · <Link href="/session">Session</Link>
      </p>
      <h1>Source library (brain context)</h1>
      <p>
        Identity seed and reference items are retrieved when you run a session and passed into generation as context.
        Add items below; tag as <strong>identity_seed</strong> or <strong>reference</strong>.
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Import from URL</h2>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Fetch a webpage and store it as one source item (title + extracted text). The crawl runs when you click Import.
        </p>
        <ImportFromUrlForm />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Upload document</h2>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Upload a .md or .txt file to add its contents as one source item.
        </p>
        <UploadDocForm />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Add source item (manual)</h2>
        <AddSourceItemForm />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Items ({list.length})</h2>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          <strong>identity_seed</strong> and <strong>reference</strong> are used in session/chat context and identity bootstrap; other types are stored for filtering. See docs/05_build/source_item_ontology.md for the full ontology.
        </p>
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
              source_role?: string | null;
              summary: string | null;
              content_text: string | null;
              ingested_at: string;
              created_at: string;
              tags?: string[] | null;
              identity_relevance_notes?: string | null;
              identity_weight?: number | null;
              media_kind?: string | null;
              origin_reference?: string | null;
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
                  [{item.source_type}]{item.source_role ? ` · ${item.source_role}` : ""}
                  {item.identity_weight != null ? ` · weight ${item.identity_weight}` : ""}
                </span>
                {item.tags?.length ? (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#555" }}>
                    Tags: {item.tags.join(", ")}
                  </p>
                ) : null}
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
                {item.identity_relevance_notes && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#555", fontStyle: "italic" }}>
                    {item.identity_relevance_notes.slice(0, 150)}
                    {item.identity_relevance_notes.length > 150 ? "…" : ""}
                  </p>
                )}
                {item.origin_reference && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                    <a href={item.origin_reference} target="_blank" rel="noopener noreferrer" style={{ color: "#0066cc" }}>
                      {item.origin_reference.slice(0, 60)}
                      {item.origin_reference.length > 60 ? "…" : ""}
                    </a>
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
