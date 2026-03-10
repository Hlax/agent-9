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
    summary: string | null;
    philosophy: string | null;
    embodiment_direction: string | null;
    habitat_direction: string | null;
  } | null = null;
  if (supabase) {
    const { data } = await supabase
      .from("identity")
      .select("identity_id, name, summary, philosophy, embodiment_direction, habitat_direction")
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
        <Link href="/">← Studio</Link> · <Link href="/source">Source library</Link>
      </p>
      <h1>Twin identity</h1>
      <p style={{ color: "#555" }}>
        One canonical identity. Sources in the library are <strong>evidence</strong> that inform identity; they are not identities. Use the form below to edit, or generate from the source library.
      </p>
      {identity ? (
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          Display: {identity.name ? identity.name : "Unnamed Twin (active)"}
        </p>
      ) : (
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          No identity row yet. Save the form or run &quot;Generate initial identity from source library&quot; to create one.
        </p>
      )}
      <IdentityForm initial={identity} />
    </main>
  );
}
