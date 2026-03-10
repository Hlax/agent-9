import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { IdentityForm } from "./identity-form";

/**
 * Twin identity page. Canon: one active identity; name optional; bootstrap from sources.
 * Sources are evidence only; this page and bootstrap are explicit identity formation paths.
 */
export default async function IdentityPage() {
  const supabase = getSupabaseServer();
  let identity: {
    identity_id: string;
    name: string | null;
    name_status: string | null;
    naming_readiness_score: number | null;
    naming_readiness_notes: string | null;
    summary: string | null;
    philosophy: string | null;
    embodiment_direction: string | null;
    habitat_direction: string | null;
  } | null = null;
  if (supabase) {
    const { data } = await supabase
      .from("identity")
      .select("identity_id, name, name_status, naming_readiness_score, naming_readiness_notes, summary, philosophy, embodiment_direction, habitat_direction")
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    identity = data ?? null;
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "1rem" }}>
      <p>
        <Link href="/">← Twin</Link> · <Link href="/source">Source library</Link>
      </p>
      <h1>Twin identity</h1>
      <p style={{ color: "#555" }}>
        One canonical identity. Sources in the library are <strong>evidence</strong> that inform identity; they are not identities. Use the form below to edit, or generate from the source library.
      </p>
      {identity ? (
        <>
          <p style={{ fontSize: "0.9rem", color: "#666" }}>
            Display: {identity.name && identity.name_status === "accepted" ? identity.name : "Unnamed Twin (active)"}
          </p>
          {identity.name_status && (
            <p style={{ fontSize: "0.85rem", color: "#666" }}>
              Name status: {identity.name_status}
            </p>
          )}
          <section style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.25rem" }}>Naming readiness</p>
            <p style={{ fontSize: "0.85rem", color: "#666" }}>
              Score: {identity.naming_readiness_score != null ? Number(identity.naming_readiness_score).toFixed(2) : "Not evaluated"}
            </p>
            {identity.naming_readiness_notes && (
              <p style={{ fontSize: "0.85rem", color: "#555", maxWidth: 480 }}>{identity.naming_readiness_notes}</p>
            )}
          </section>
        </>
      ) : (
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          No identity row yet. Save the form or run &quot;Generate initial identity from source library&quot; to create one.
        </p>
      )}
      <IdentityForm initial={identity} />
      {identity && !identity.name && identity.name_status !== "accepted" && (
        <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          Ask the Twin its name in chat; it will use naming readiness to decide whether to propose one. You can run &quot;Evaluate naming readiness&quot; below to refresh the score first.
        </p>
      )}
    </main>
  );
}
