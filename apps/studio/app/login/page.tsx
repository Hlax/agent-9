"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 360, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Sign in to Twin Studio</h1>
      <p>Private operator interface. Sign in with your Supabase Auth account.</p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.5rem" }}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ display: "block", width: "100%", marginTop: 0.25, padding: "0.5rem" }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ display: "block", width: "100%", marginTop: 0.25, padding: "0.5rem" }}
          />
        </label>
        {message && (
          <p style={{ color: message.type === "error" ? "crimson" : "green", margin: 0 }}>
            {message.text}
          </p>
        )}
        <button type="submit" disabled={loading} style={{ padding: "0.5rem 1rem" }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ marginTop: "1.5rem", fontSize: "0.9rem", color: "#666" }}>
        For local dev, create a user in Supabase Studio (http://127.0.0.1:54323) under Authentication → Users, or use the SQL editor to insert into auth.users.
      </p>
    </main>
  );
}
