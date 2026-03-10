/**
 * Staging Habitat
 * Sandbox preview environment for artifacts, UI/system experiments, and build state.
 * Canon: staging does not equal public release; it never mutates Studio or Public directly.
 */

type TargetSurface = "studio" | "staging_habitat" | "public_habitat";

type ProposalType = "layout" | "component" | "navigation" | "workflow" | "visual_system" | "publishing";

type ProposalStatus = "proposed" | "under_review" | "approved" | "rejected" | "implemented";

interface ChangeProposal {
  id: string;
  title: string;
  target_surface: TargetSurface;
  proposal_type: ProposalType;
  rationale: string;
  artifact_id?: string | null;
  idea_thread_id?: string | null;
  preview_url?: string | null;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
}

interface BuildState {
  environment: "staging" | "production" | "development";
  git_branch: string;
  commit_sha: string;
  last_commit_message: string;
  last_deploy_time: string;
  app_version: string | null;
  product_version: string | null;
  staging_in_sync_with_main: boolean | null;
}

type StagingFetchResult = { proposals: ChangeProposal[]; error?: string };

async function getStagingProposals(): Promise<StagingFetchResult> {
  const base = process.env.NEXT_PUBLIC_STUDIO_URL ?? "";
  const url = base ? `${base.replace(/\/$/, "")}/api/staging/proposals` : "";
  if (!url) return { proposals: [] };
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { proposals: [], error: `Studio returned ${res.status}${text ? `: ${text.slice(0, 80)}` : "" } };
    }
    const data = await res.json();
    const list = Array.isArray(data.proposals) ? data.proposals : [];
    const proposals = list.map((p: Record<string, unknown>) => ({
      id: String(p.proposal_record_id ?? ""),
      title: String(p.title ?? ""),
      target_surface: (p.target_surface as TargetSurface) ?? "staging_habitat",
      proposal_type: (p.proposal_type as ProposalType) ?? "layout",
      rationale: String(p.summary ?? ""),
      artifact_id: (p.artifact_id as string | null) ?? null,
      idea_thread_id: null,
      preview_url: (p.preview_uri as string) ?? null,
      status: mapProposalStateToStatus(String(p.proposal_state ?? "proposed")),
      created_at: String(p.created_at ?? ""),
      updated_at: String(p.updated_at ?? ""),
    }));
    return { proposals };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return { proposals: [], error: message };
  }
}

function mapProposalStateToStatus(state: string): ProposalStatus {
  if (state === "approved_for_staging" || state === "staged") return "under_review";
  if (state === "approved_for_publication" || state === "approved") return "approved";
  if (state === "published") return "implemented";
  if (state === "rejected") return "rejected";
  return "proposed";
}

// Mock seed data for proposals (fallback when no Studio URL or API empty).
const mockProposals: ChangeProposal[] = [
  {
    id: "ui-nav-001",
    title: "Add Change Proposals section to Staging sidebar",
    target_surface: "staging_habitat",
    proposal_type: "navigation",
    rationale: "Give Twin and Harvey a clear entry point to review UI and system proposals without touching Studio or Public directly.",
    artifact_id: null,
    idea_thread_id: "thread-creative-01",
    preview_url: "/staging/preview/ui-nav-001",
    status: "under_review",
    created_at: "2026-03-09T10:15:00.000Z",
    updated_at: "2026-03-09T12:30:00.000Z",
  },
  {
    id: "pub-layout-002",
    title: "Public habitat hero layout experiment",
    target_surface: "public_habitat",
    proposal_type: "layout",
    rationale: "Test a more narrative hero layout that foregrounds the Twin’s philosophy and recent artifacts before publishing to the real public surface.",
    artifact_id: "artifact-hero-sketch-01",
    idea_thread_id: null,
    preview_url: "/staging/preview/pub-layout-002",
    status: "proposed",
    created_at: "2026-03-08T17:45:00.000Z",
    updated_at: "2026-03-08T17:45:00.000Z",
  },
  {
    id: "studio-workflow-003",
    title: "Studio review workflow tweaks",
    target_surface: "studio",
    proposal_type: "workflow",
    rationale: "Group system, surface, and habitat proposals in a single Studio review lane so Harvey has one place to approve changes before they reach staging.",
    artifact_id: null,
    idea_thread_id: "thread-governance-02",
    preview_url: null,
    status: "approved",
    created_at: "2026-03-05T09:00:00.000Z",
    updated_at: "2026-03-07T14:10:00.000Z",
  },
];

// Mock build state (real implementation should come from a /api/system/context route reading git + runtime safely).
const mockBuildState: BuildState = {
  environment: "staging",
  git_branch: "feature/staging-habitat-v1",
  commit_sha: "a1b2c3d4",
  last_commit_message: "Add Staging Habitat change proposals and build state panel",
  last_deploy_time: "2026-03-09T11:20:00.000Z",
  app_version: "0.3.0-staging",
  product_version: "0.3.0",
  staging_in_sync_with_main: false,
};

export default async function StagingHome() {
  const { proposals: realProposals, error: fetchError } = await getStagingProposals();
  const proposals = realProposals.length > 0 ? realProposals : mockProposals;
  const primaryProposal = proposals[0]!;

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "1.5rem 1rem 2rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.6rem", marginBottom: "0.4rem" }}>Staging Habitat</h1>
        <p style={{ margin: 0, color: "#555", maxWidth: 720 }}>
          Sandbox for previewing staging-approved artifacts, UI/system experiments, and habitat changes. This surface is read-only relative to Studio and Public; Harvey approves structural changes in Studio.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: "1.5rem",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <BuildStatePanel state={mockBuildState} />
          {fetchError ? (
            <p style={{ color: "#c00", marginBottom: "0.5rem" }}>Unable to load proposals: {fetchError}</p>
          ) : null}
          <ChangeProposalsSection proposals={proposals} />
        </div>
        <BeforeAfterPreview proposal={primaryProposal} />
      </section>
    </main>
  );
}

function BuildStatePanel({ state }: { state: BuildState }) {
  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.9rem 1rem", background: "#fafafa" }}>
      <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem" }}>Build state</h2>
      <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
        Snapshot of repo and runtime state for situational awareness. Staging reads from git and runtime; Studio remains the approval surface.
      </p>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "0.75rem", rowGap: "0.25rem", marginTop: "0.75rem", fontSize: "0.9rem" }}>
        <dt style={{ fontWeight: 600 }}>Environment</dt>
        <dd style={{ margin: 0 }}>{state.environment}</dd>
        <dt style={{ fontWeight: 600 }}>Git branch</dt>
        <dd style={{ margin: 0 }}>{state.git_branch}</dd>
        <dt style={{ fontWeight: 600 }}>Commit</dt>
        <dd style={{ margin: 0 }}>
          <code>{state.commit_sha}</code>
        </dd>
        <dt style={{ fontWeight: 600 }}>Last commit</dt>
        <dd style={{ margin: 0 }}>{state.last_commit_message}</dd>
        <dt style={{ fontWeight: 600 }}>Last deploy</dt>
        <dd style={{ margin: 0 }}>{new Date(state.last_deploy_time).toLocaleString()}</dd>
        <dt style={{ fontWeight: 600 }}>App / product</dt>
        <dd style={{ margin: 0 }}>
          {state.app_version ?? "n/a"}
          {state.product_version ? ` - ${state.product_version}` : ""}
        </dd>
        <dt style={{ fontWeight: 600 }}>Staging vs main</dt>
        <dd style={{ margin: 0 }}>
          {state.staging_in_sync_with_main === null
            ? "Unknown"
            : state.staging_in_sync_with_main
            ? "Appears in sync with main"
            : "Ahead of or diverged from main"}
        </dd>
      </dl>
    </section>
  );
}

function ChangeProposalsSection({ proposals }: { proposals: ChangeProposal[] }) {
  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.9rem 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
        <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Change proposals</h2>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>Read-only in staging · approve in Studio</span>
      </header>
      <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
        Twin and Harvey proposals for Studio, Staging Habitat, and Public Habitat are previewed here. Approval, publication, and deployment still flow through Studio and your build pipeline.
      </p>
      <ul style={{ listStyle: "none", padding: 0, marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {proposals.map((p) => (
          <li
            key={p.id}
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              padding: "0.75rem 0.75rem",
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
              <div>
                <strong style={{ fontSize: "0.95rem" }}>{p.title}</strong>
                <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.1rem" }}>
                  <span style={{ textTransform: "capitalize" }}>{p.target_surface.replace("_", " ")}</span>
                  {" · "}
                  <span>{p.proposal_type.replace("_", " ")}</span>
                </div>
              </div>
              <StatusPill status={p.status} />
            </div>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#444" }}>{p.rationale}</p>
            <div style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "#666", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {p.artifact_id && <span>Artifact: {p.artifact_id}</span>}
              {p.idea_thread_id && <span>Idea thread: {p.idea_thread_id}</span>}
              {p.preview_url && <span>Preview: {p.preview_url}</span>}
              <span>
                Created: {new Date(p.created_at).toLocaleDateString()} · Updated:{" "}
                {new Date(p.updated_at).toLocaleDateString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPill({ status }: { status: ProposalStatus }) {
  const label = status.replace("_", " ");
  const palette: Record<ProposalStatus, { bg: string; color: string }> = {
    proposed: { bg: "#e3f2fd", color: "#0d47a1" },
    under_review: { bg: "#fff3e0", color: "#e65100" },
    approved: { bg: "#e8f5e9", color: "#1b5e20" },
    rejected: { bg: "#ffebee", color: "#b71c1c" },
    implemented: { bg: "#ede7f6", color: "#4a148c" },
  };
  const colors = palette[status];
  return (
    <span
      style={{
        padding: "0.15rem 0.45rem",
        borderRadius: 999,
        fontSize: "0.75rem",
        fontWeight: 600,
        textTransform: "capitalize",
        background: colors.bg,
        color: colors.color,
      }}
    >
      {label}
    </span>
  );
}

function BeforeAfterPreview({ proposal }: { proposal: ChangeProposal }) {
  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.9rem 1rem" }}>
      <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem" }}>Habitat before / after</h2>
      <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
        Comparison of current Public Habitat vs a staged proposal. In V1 this uses mock content; in production it should
        render real public layout on the left and the proposal preview on the right.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "0.75rem",
          marginTop: "0.75rem",
        }}
      >
        <div
          style={{
            borderRadius: 6,
            border: "1px dashed #ccc",
            padding: "0.75rem",
            background: "#fafafa",
            minHeight: 140,
          }}
        >
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.25rem" }}>Current public habitat (mock)</h3>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>
            Snapshot of the currently published public surface. In a real deployment this would render the live public
            layout or a cached screenshot.
          </p>
        </div>
        <div
          style={{
            borderRadius: 6,
            border: "1px dashed #ccc",
            padding: "0.75rem",
            background: "#fff",
            minHeight: 140,
          }}
        >
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.25rem" }}>Staged proposal preview</h3>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>
            {proposal.target_surface === "public_habitat"
              ? "This proposal targets the public habitat. Use this panel to preview layout and visual changes before publishing."
              : "This proposal targets Studio or Staging Habitat itself. Use this panel to preview how the control surfaces would change."}
          </p>
          <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "#444" }}>
            <strong>{proposal.title}</strong>
            <br />
            {proposal.rationale}
          </p>
          {proposal.preview_url && (
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "#666" }}>
              Preview route: <code>{proposal.preview_url}</code>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

