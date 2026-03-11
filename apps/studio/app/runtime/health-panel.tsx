import type { RuntimeHealthSummary } from "@/lib/runtime-health";

interface HealthPanelProps {
  health: RuntimeHealthSummary | null;
}

export function HealthPanel({ health }: HealthPanelProps) {
  const flags = health?.flags ?? [];
  const windowSize = health?.windowSize ?? 0;

  return (
    <section
      style={{
        marginTop: "1.5rem",
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem",
        background: "#fafafa",
      }}
    >
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Runtime health (advisory)</h2>
      <p style={{ fontSize: "0.8rem", color: "#666", margin: "0 0 0.5rem" }}>
        Based on ontology continuity over the last {windowSize || "—"} sessions. These flags are advisory only and do
        not change governance or behavior.
      </p>
      {windowSize === 0 && (
        <p style={{ fontSize: "0.85rem", color: "#666", margin: 0 }}>
          <em>No recent sessions to evaluate.</em>
        </p>
      )}
      {windowSize > 0 && flags.length === 0 && (
        <p style={{ fontSize: "0.85rem", color: "#444", margin: 0 }}>No major health flags detected.</p>
      )}
      {flags.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {flags.map((f) => (
            <li
              key={f.id}
              style={{
                borderTop: "1px solid #eee",
                padding: "0.35rem 0",
                fontSize: "0.8rem",
              }}
            >
              <div>
                <strong>{f.label}</strong>{" "}
                <span style={{ textTransform: "uppercase", fontSize: "0.7rem", color: "#666" }}>
                  ({f.level})
                </span>
              </div>
              <div style={{ color: "#444" }}>{f.evidence}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

