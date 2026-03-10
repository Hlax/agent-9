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

function formatScore(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

export function MetabolismPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/runtime/state")
      .then((r) => r.json())
      .then((body) => {
        setSnapshot(body.snapshot ?? null);
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
    </section>
  );
}

