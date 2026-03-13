import Link from "next/link";
import { StagingReviewClient } from "./staging-review-client";

export default function StagingReviewPage() {
  return (
    <main>
      <h1>Staging review</h1>
      <p>
        Combined staging review surface for habitat, artifacts, critiques, extensions,
        and system proposals. Use this page to review proposals in context before
        promoting staging to the public snapshot chain.
      </p>
      <p>
        <Link href="/review">← Review home</Link>
      </p>
      <StagingReviewClient />
    </main>
  );
}

