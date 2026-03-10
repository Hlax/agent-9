"use client";

import { useState, useEffect } from "react";

type RuntimeMode = "slow" | "default" | "steady" | "turbo";

interface Config {
  mode: RuntimeMode;
  always_on: boolean;
  last_run_at: string | null;
}

export function RuntimePanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/runtime/config")
      .then((r) => r.json())
      .then((data) => setConfig({ mode: data.mode ?? "default", always_on: !!data.always_on, last_run_at: data.last_run_at ?? null }))
      .catch(() => setConfig({ mode: "default", always_on: false, last_run_at: null }));
  }, []);

  async function update(updates: Partial<Config>) {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/runtime/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setConfig({ mode: data.mode ?? config.mode, always_on: !!data.always_on, last_run_at: data.last_run_at ?? config.last_run_at });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.9rem", background: "#fafafa" }}><p style={{ margin: 0, color: "#666" }}>Loading runtime…</p></section>;

  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.9rem 1rem", background: "#fafafa" }}>
      <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem" }}>Runtime</h2>
      <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
        Scheduler mode and always-on. When always-on is enabled, call <code>GET /api/cron/session</code> with header <code>x-cron-secret</code> (e.g. from a cron job) to trigger sessions at the chosen cadence.
      </p>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "0.75rem", rowGap: "0.25rem", marginTop: "0.75rem", fontSize: "0.9rem" }}>
        <dt style={{ fontWeight: 600 }}>Mode</dt>
        <dd style={{ margin: 0 }}>
          <select
            value={config.mode}
            onChange={(e) => update({ mode: e.target.value as RuntimeMode })}
            disabled={saving}
            style={{ padding: "0.25rem 0.5rem", borderRadius: 4 }}
          >
            <option value="slow">Slow (~1–3/hr)</option>
            <option value="default">Default</option>
            <option value="steady">Steady (~20/hr)</option>
            <option value="turbo">Turbo</option>
          </select>
        </dd>
        <dt style={{ fontWeight: 600 }}>Always-on</dt>
        <dd style={{ margin: 0 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <input
              type="checkbox"
              checked={config.always_on}
              onChange={(e) => update({ always_on: e.target.checked })}
              disabled={saving}
            />
            Enabled
          </label>
        </dd>
        <dt style={{ fontWeight: 600 }}>Last run</dt>
        <dd style={{ margin: 0 }}>{config.last_run_at ? new Date(config.last_run_at).toLocaleString() : "—"}</dd>
      </dl>
      {error && <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#c00" }}>{error}</p>}
    </section>
  );
}
