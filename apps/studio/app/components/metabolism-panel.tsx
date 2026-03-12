"use client";

import { useEffect, useState } from "react";

interface Snapshot {
  identity_stability: number | null;
  avatar_alignment: number | null;
  expression_diversity: number | null;
  unfinished_projects: number | null;
  recent_exploration_rate: number | null;
  creative_tension: number | null;
  curiosity_level: number | null;
  reflection_need: number | null;
  idea_recurrence: number | null;
  public_curation_backlog: number | null;
  created_at: string;
}

interface BacklogState {
  artifacts: Record<string, number>;
  proposals: Record<string, number>;
}

function formatScore(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

function sumValues(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

export function MetabolismPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [backlog, setBacklog] = useState<BacklogState | null>(null);
  const [runtime, setRuntime] = useState<{ mode?: string; tokens_used_today?: number } | null>(null);
  const [returnCandidates, setReturnCandidates] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/runtime/state`
        : "/api/runtime/state";
    fetch(url)
      .then((r) => r.json())
      .then((body) => {
        setSnapshot(body.snapshot ?? null);
        setBacklog(body.backlog ?? null);
        setRuntime(body.runtime ?? null);
        setReturnCandidates(
          typeof body.return_candidates === "number" ? body.return_candidates : null
        );
      })
      .catch(() => setError("Failed to load metabolism state"));
  }, []);

  if (error) {
    return (
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem", background: "#fff8f8", marginTop: "0.75rem" }}>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#a00" }}>Metabolism: {error}</p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem", background: "#fafafa", marginTop: "0.75rem" }}>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>Metabolism: waiting for first session…</p>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem 1rem", background: "#fafafa", marginTop: "0.75rem" }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>Metabolism</h2>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "#555" }}>
        Latest creative state snapshot ({new Date(snapshot.created_at).toLocaleString()}).
      </p>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto auto",
          gap: "0.25rem 0.75rem",
          marginTop: "0.5rem",
          fontSize: "0.8rem",
        }}
      >
        <dt>Identity stability</dt>
        <dd>{formatScore(snapshot.identity_stability)}</dd>
        <dt>Avatar alignment</dt>
        <dd>{formatScore(snapshot.avatar_alignment)}</dd>
        <dt>Expression diversity</dt>
        <dd>{formatScore(snapshot.expression_diversity)}</dd>
        <dt>Unfinished projects</dt>
        <dd>{formatScore(snapshot.unfinished_projects)}</dd>
        <dt>Exploration rate</dt>
        <dd>{formatScore(snapshot.recent_exploration_rate)}</dd>
        <dt>Creative tension</dt>
        <dd>{formatScore(snapshot.creative_tension)}</dd>
        <dt>Curiosity</dt>
        <dd>{formatScore(snapshot.curiosity_level)}</dd>
        <dt>Reflection need</dt>
        <dd>{formatScore(snapshot.reflection_need)}</dd>
        <dt>Idea recurrence</dt>
        <dd>{formatScore(snapshot.idea_recurrence)}</dd>
        <dt>Public curation backlog</dt>
        <dd>{formatScore(snapshot.public_curation_backlog)}</dd>
      </dl>
      {backlog && (
        <>
          <h3 style={{ fontSize: "0.9rem", margin: "0.75rem 0 0.35rem" }}>Backlog</h3>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#555" }}>
            Artifacts by state/role: {Object.keys(backlog.artifacts).length
              ? Object.entries(backlog.artifacts)
                  .map(([k, v]) => `${k.replace(/__/g, " ")}: ${v}`)
                  .join(" · ")
              : "0"}
            . Proposals: {sumValues(backlog.proposals)} total (habitat_layout cap 2, avatar cap 3).
          </p>
        </>
      )}
      {runtime && (
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "#666" }}>
          Mode: {runtime.mode ?? "—"} · Tokens today: {runtime.tokens_used_today ?? 0}
          {returnCandidates !== null && ` · Return candidates: ${returnCandidates}`}
        </p>
      )}
    </section>
  );
}

