import Link from "next/link";
import { SignOut } from "./sign-out";
import { StudioChat } from "./components/studio-chat";
import { RuntimePanel } from "./components/runtime-panel";

export default function StudioHome() {
  return (
    <main>
      <h1>Twin Studio</h1>
      <p>Private operator interface.</p>
      <nav style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <Link href="/">Twin</Link>
        <Link href="/session" style={{ padding: "0.35rem 0.75rem", background: "#111", color: "#fff", borderRadius: 6, fontWeight: 600 }}>
          Start
        </Link>
        <Link href="/source">🧠 (brain)</Link>
        <Link href="/identity">🪪 Identity</Link>
        <Link href="/session">▶️ Session</Link>
        <Link href="/concepts">💡 Concepts</Link>
        <Link href="/review/artifacts">📋 Artifacts</Link>
        <Link href="/review/surface">🎭 Surface</Link>
        <Link href="/review/system">⚙️ System</Link>
        <SignOut />
      </nav>
      <div style={{ marginTop: "1.5rem", maxWidth: 560 }}>
        <RuntimePanel />
      </div>
      <StudioChat />
    </main>
  );
}
