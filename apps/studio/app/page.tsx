import Link from "next/link";
import { SignOut } from "./sign-out";

export default function StudioHome() {
  return (
    <main>
      <h1>Twin Studio</h1>
      <p>Private operator interface.</p>
      <nav style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <Link href="/source">Source library (brain)</Link>
        <Link href="/session">Start session</Link>
        <Link href="/review/artifacts">Artifact review queue</Link>
        <Link href="/review/surface">Surface proposals (avatar &amp; habitat)</Link>
        <SignOut />
      </nav>
    </main>
  );
}
