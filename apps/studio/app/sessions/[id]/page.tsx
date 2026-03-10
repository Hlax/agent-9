import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { notFound } from "next/navigation";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const supabase = getSupabaseServer();
  if (!supabase) notFound();

  const { data: session } = await supabase
    .from("creative_session")
    .select("*")
    .eq("session_id", sessionId)
    .single();
  if (!session) notFound();

  const [artifactsRes, critiquesRes, snapshotsRes, memoriesRes] = await Promise.all([
    supabase.from("artifact").select("*").eq("session_id", sessionId),
    supabase.from("critique_record").select("*").eq("session_id", sessionId),
    supabase.from("creative_state_snapshot").select("*").eq("session_id", sessionId),
    supabase.from("memory_record").select("*").eq("source_session_id", sessionId),
  ]);

  const artifacts = artifactsRes.data ?? [];
  const artifactIds = artifacts.map((a: { artifact_id: string }) => a.artifact_id);
  let signals: unknown[] = [];
  if (artifactIds.length > 0) {
    const { data } = await supabase
      .from("evaluation_signal")
      .select("*")
      .eq("target_type", "artifact")
      .in("target_id", artifactIds);
    signals = data ?? [];
  }

  const critiques = critiquesRes.data ?? [];
  const snapshots = snapshotsRes.data ?? [];
  const memories = memoriesRes.data ?? [];

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p><Link href="/">← Twin</Link> · <Link href="/session">Session</Link></p>
      <h1>Session {sessionId.slice(0, 8)}…</h1>
      <p><strong>Mode:</strong> {session.mode} · <strong>Started:</strong> {new Date(session.started_at).toISOString()}</p>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Artifacts</h2>
        {artifacts.length === 0 ? <p><em>None</em></p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {(artifacts as Array<{ artifact_id: string; title: string; summary: string | null; medium: string; current_approval_state: string | null; alignment_score: number | null }>).map((a) => (
              <li key={a.artifact_id} style={{ border: "1px solid #ddd", padding: "0.75rem", marginBottom: "0.5rem", borderRadius: 4 }}>
                <strong>{a.title}</strong> · {a.medium} · {a.current_approval_state ?? "—"}
                {a.alignment_score != null && <span> · alignment: {a.alignment_score.toFixed(2)}</span>}
                {a.summary && <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>{a.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Critique records</h2>
        {critiques.length === 0 ? <p><em>None</em></p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {(critiques as Array<{ critique_record_id: string; overall_summary: string | null; critique_outcome: string | null }>).map((c) => (
              <li key={c.critique_record_id} style={{ border: "1px solid #eee", padding: "0.75rem", marginBottom: "0.5rem", borderRadius: 4 }}>
                <strong>Outcome:</strong> {c.critique_outcome ?? "—"}
                {c.overall_summary && <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>{c.overall_summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Evaluation signals</h2>
        {signals.length === 0 ? <p><em>None</em></p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {(signals as Array<{ evaluation_signal_id: string; target_id: string; alignment_score: number | null; emergence_score: number | null; fertility_score: number | null; pull_score: number | null; recurrence_score: number | null; rationale: string | null }>).map((s) => (
              <li key={s.evaluation_signal_id} style={{ border: "1px solid #eee", padding: "0.75rem", marginBottom: "0.5rem", borderRadius: 4 }}>
                <strong>Target:</strong> {s.target_id.slice(0, 8)}… · alignment: {s.alignment_score?.toFixed(2) ?? "—"} · emergence: {s.emergence_score?.toFixed(2) ?? "—"} · fertility: {s.fertility_score?.toFixed(2) ?? "—"} · pull: {s.pull_score?.toFixed(2) ?? "—"} · recurrence: {s.recurrence_score?.toFixed(2) ?? "—"}
                {s.rationale && <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#555" }}>{s.rationale.slice(0, 200)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Creative state snapshot</h2>
        {snapshots.length === 0 ? <p><em>None</em></p> : (
          <pre style={{ background: "#f5f5f5", padding: "0.75rem", borderRadius: 4, fontSize: "0.85rem", overflow: "auto" }}>
            {JSON.stringify(snapshots[0], null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Memory records</h2>
        {memories.length === 0 ? <p><em>None</em></p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {(memories as Array<{ memory_record_id: string; memory_type: string; summary: string }>).map((m) => (
              <li key={m.memory_record_id} style={{ border: "1px solid #eee", padding: "0.75rem", marginBottom: "0.5rem", borderRadius: 4 }}>
                <strong>{m.memory_type}</strong>: {m.summary}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
