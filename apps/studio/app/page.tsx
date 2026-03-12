import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { SignOut } from "./sign-out";
import { StudioChat } from "./components/studio-chat";
import { RuntimePanel } from "./components/runtime-panel";
import { MetabolismPanel } from "./components/metabolism-panel";

export default async function StudioHome() {
  const supabase = getSupabaseServer();
  let latestArtifacts:
    | {
        artifact_id: string;
        medium: string;
        session_id: string | null;
        created_at: string;
      }[]
    = [];

  if (supabase) {
    const { data } = await supabase
      .from("artifact")
      .select("artifact_id, medium, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    latestArtifacts = data ?? [];
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "1.25rem 1rem 2rem",
      }}
    >
      <header
        style={{
          maxWidth: 960,
          width: "100%",
          margin: "0 auto 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Twin Studio</h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.95rem", color: "#555" }}>Private operator interface.</p>
        </div>
        <nav
          className="studio-nav"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <Link href="/">Twin</Link>
          <Link
            href="/session"
            style={{
              padding: "0.35rem 0.75rem",
              background: "#111",
              color: "#fff",
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            Start
          </Link>
          <Link href="/source">🧠 (brain)</Link>
          <Link href="/identity">🪪 Identity</Link>
          <Link href="/session">▶️ Session</Link>
          <Link href="/concepts">💡 Concepts</Link>
          <Link href="/review/artifacts">📋 Artifacts</Link>
          <Link href="/review">✅ Review</Link>
          <Link href="/runtime">🔍 Runtime</Link>
          <SignOut />
        </nav>
      </header>
      <div
        style={{
          maxWidth: 960,
          width: "100%",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "1.5rem",
        }}
      >
        <section style={{ maxWidth: 560, width: "100%" }}>
          <RuntimePanel />
        </section>
        <section style={{ maxWidth: 560, width: "100%" }}>
          <MetabolismPanel />
        </section>
        <section style={{ maxWidth: 560, width: "100%" }}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Latest artifacts (quick recap)</h2>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "#555" }}>
            Last 10 artifacts by creation time. ID, medium, and timestamp.
          </p>
          {latestArtifacts.length === 0 ? (
            <p style={{ fontSize: "0.9rem", color: "#666" }}>
              <em>No artifacts yet. Run a session to generate one.</em>
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {latestArtifacts.map((a) => (
                <li
                  key={a.artifact_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid #eee",
                    fontSize: "0.9rem",
                  }}
                >
                  <span
                    style={{
                      maxWidth: "40%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.session_id ? (
                      <Link href={`/review/artifacts#artifact-${a.artifact_id}`}>
                        <code style={{ fontSize: "0.8rem" }}>{a.artifact_id.slice(0, 8)}…</code>
                      </Link>
                    ) : (
                      <code style={{ fontSize: "0.8rem" }}>{a.artifact_id.slice(0, 8)}…</code>
                    )}
                  </span>
                  <span style={{ minWidth: 70, textAlign: "center", color: "#333" }}>{a.medium}</span>
                  <span style={{ flex: 1, textAlign: "right", color: "#666" }}>
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section style={{ maxWidth: 560, width: "100%" }}>
          <StudioChat />
        </section>
      </div>
    </main>
  );
}
