import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";

export default async function SessionsListPage() {
  const supabase = getSupabaseServer();
  const sessions = supabase
    ? (
        await supabase
          .from("creative_session")
          .select("session_id, mode, started_at, created_at")
          .order("created_at", { ascending: false })
          .limit(30)
      ).data ?? []
    : [];

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p><Link href="/">← Studio</Link> · <Link href="/session">Session</Link></p>
      <h1>Sessions</h1>
      <p>Recent creative sessions. Click to inspect artifacts, critique, evaluation, state snapshot, and memory.</p>
      {sessions.length === 0 ? (
        <p><em>No sessions yet. Run one from Session.</em></p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {(sessions as Array<{ session_id: string; mode: string; started_at: string; created_at: string }>).map((s) => (
            <li key={s.session_id} style={{ marginBottom: "0.5rem" }}>
              <Link href={`/sessions/${s.session_id}`}>
                {s.session_id.slice(0, 8)}… · {s.mode} · {new Date(s.started_at ?? s.created_at).toISOString()}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
