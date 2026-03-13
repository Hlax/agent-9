import { LiveTwinClient } from "./live-twin-client";

/**
 * Live Twin — read-only view of what the public sees.
 * Data source: GET /api/public/habitat-content (reads habitat_snapshot only).
 * This page does not read from staging or public_habitat_content.
 */
export default function LiveTwinPage() {
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
          margin: "0 auto 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Live Twin</h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>
            Read-only. This is what the public site serves — from the latest approved <code>habitat_snapshot</code>.
          </p>
        </div>
      </header>

      <section
        style={{
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          padding: "1rem",
          background: "#fafafa",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
        }}
      >
        <LiveTwinClient />
      </section>
    </main>
  );
}
