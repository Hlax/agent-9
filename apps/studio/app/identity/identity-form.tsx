"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type IdentityRow = {
  identity_id: string;
  name: string | null;
  summary: string | null;
  philosophy: string | null;
  embodiment_direction: string | null;
  habitat_direction: string | null;
} | null;

export function IdentityForm({ initial }: { initial: IdentityRow }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentityRow>(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [philosophy, setPhilosophy] = useState(initial?.philosophy ?? "");
  const [embodiment, setEmbodiment] = useState(initial?.embodiment_direction ?? "");
  const [habitat, setHabitat] = useState(initial?.habitat_direction ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [bootstrapStatus, setBootstrapStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [bootstrapMessage, setBootstrapMessage] = useState("");

  useEffect(() => {
    if (initial) {
      setIdentity(initial);
      setName(initial.name ?? "");
      setSummary(initial.summary ?? "");
      setPhilosophy(initial.philosophy ?? "");
      setEmbodiment(initial.embodiment_direction ?? "");
      setHabitat(initial.habitat_direction ?? "");
    }
  }, [initial]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveMessage("");
    try {
      const res = await fetch("/api/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          summary: summary.trim() || null,
          philosophy: philosophy.trim() || null,
          embodiment_direction: embodiment.trim() || null,
          habitat_direction: habitat.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setIdentity(data.identity);
      setSaveMessage("Saved.");
      setSaveStatus("done");
      router.refresh();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed");
      setSaveStatus("error");
    }
  }

  async function handleBootstrap() {
    setBootstrapStatus("running");
    setBootstrapMessage("");
    try {
      const res = await fetch("/api/identity/bootstrap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bootstrap failed");
      setIdentity(data.identity);
      setSummary(data.identity?.summary ?? "");
      setPhilosophy(data.identity?.philosophy ?? "");
      setEmbodiment(data.identity?.embodiment_direction ?? "");
      setHabitat(data.identity?.habitat_direction ?? "");
      setBootstrapMessage("Identity generated from source library. Name left unchanged.");
      setBootstrapStatus("done");
      router.refresh();
    } catch (err) {
      setBootstrapMessage(err instanceof Error ? err.message : "Bootstrap failed");
      setBootstrapStatus("error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1.5rem" }}>
      <section>
        <h2 style={{ marginBottom: "0.5rem" }}>Generate from source library</h2>
        <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "0.75rem" }}>
          Aggregates identity_seed and reference sources and distills summary, philosophy, embodiment, and habitat. Does not invent or overwrite the Twin&apos;s name.
        </p>
        <button
          type="button"
          onClick={handleBootstrap}
          disabled={bootstrapStatus === "running"}
          style={{ padding: "0.5rem 1rem" }}
        >
          {bootstrapStatus === "running" ? "Running…" : "Generate initial identity from source library"}
        </button>
        {bootstrapMessage && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: bootstrapStatus === "error" ? "#c00" : "#363" }}>
            {bootstrapMessage}
          </p>
        )}
      </section>

      <section>
        <h2 style={{ marginBottom: "0.5rem" }}>Edit identity</h2>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label htmlFor="identity-name" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
              Name (optional)
            </label>
            <input
              id="identity-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave blank to let the Twin name itself later"
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </div>
          <div>
            <label htmlFor="identity-summary" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
              Summary
            </label>
            <textarea
              id="identity-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </div>
          <div>
            <label htmlFor="identity-philosophy" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
              Philosophy
            </label>
            <textarea
              id="identity-philosophy"
              value={philosophy}
              onChange={(e) => setPhilosophy(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </div>
          <div>
            <label htmlFor="identity-embodiment" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
              Embodiment direction
            </label>
            <textarea
              id="identity-embodiment"
              value={embodiment}
              onChange={(e) => setEmbodiment(e.target.value)}
              rows={2}
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </div>
          <div>
            <label htmlFor="identity-habitat" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
              Habitat direction
            </label>
            <textarea
              id="identity-habitat"
              value={habitat}
              onChange={(e) => setHabitat(e.target.value)}
              rows={2}
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </div>
          <button type="submit" disabled={saveStatus === "saving"} style={{ padding: "0.5rem 1rem", alignSelf: "flex-start" }}>
            {saveStatus === "saving" ? "Saving…" : "Save identity"}
          </button>
          {saveMessage && (
            <p style={{ fontSize: "0.9rem", color: saveStatus === "error" ? "#c00" : "#363" }}>{saveMessage}</p>
          )}
        </form>
      </section>
    </div>
  );
}
