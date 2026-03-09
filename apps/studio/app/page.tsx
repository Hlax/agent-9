import Link from "next/link";
import { SignOut } from "./sign-out";
import { StudioChat } from "./components/studio-chat";

export default function StudioHome() {
  return (
    <main>
      <h1>Twin Studio</h1>
      <p>Private operator interface.</p>
      <nav style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <Link href="/source">Source library (brain)</Link>
        <Link href="/session">Start session</Link>
        <Link href="/review/artifacts">Artifact review queue</Link>
        <Link href="/review/surface">Surface proposals (avatar, habitat, name)</Link>
        <Link href="/review/system">System proposals</Link>
        <SignOut />
      </nav>
      <StudioChat />
    </main>
  );
}
