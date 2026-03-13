"use client";

import { useEffect, useState } from "react";
import type { StagingReviewModel, HabitatGroup, StagingProposalView } from "@/lib/staging-read-model";

interface PublishReview {
  identity_id: string;
  reviewed_at: string;
  diff: {
    current_public_snapshot_id: string | null;
    has_current_public: boolean;
    avatar_changed: boolean;
    layout_changed: boolean;
    blocks_added: number;
    blocks_removed: number;
    blocks_changed: number;
    extensions_changed: boolean;
    significance: "none" | "minor" | "major";
  };
  advisory_flags: {
    likely_duplicate: boolean;
    likely_reversion: boolean;
    high_recent_volatility: boolean;
    too_soon_since_last_public: boolean;
    no_current_public: boolean;
  };
  recommendation: string;
  recommendation_notes: string[];
}

interface PublishReviewState {
  loading: boolean;
  error: string | null;
  review: PublishReview | null;
}

function BucketSection({
  title,
  description,
  proposals,
  onAction,
  onNoteSave,
  busyKey,
  noteStatus,
  actionError,
}: {
  title: string;
  description?: string;
  proposals: StagingProposalView[];
  onAction: (id: string, action: string) => void;
  onNoteSave: (id: string, note: string | null) => void;
  busyKey: string | null;
  noteStatus: Record<string, "idle" | "saving" | "saved" | "error">;
  actionError: Record<string, string | null>;
}) {
  if (!proposals.length) return null;
  return (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      <ul>
        {proposals.map((p) => (
          <li key={p.id}>
            <strong>{p.title ?? "(untitled proposal)"}</strong>{" "}
            <span>— state: {p.proposal_state}</span>{" "}
            {p.target_surface ? <span> · surface: {p.target_surface}</span> : null}
            {p.proposal_role ? <span> · role: {p.proposal_role}</span> : null}
            <div>
              {p.summary ? <p>{p.summary}</p> : null}
              <label style={{ display: "block", marginTop: "0.25rem" }}>
                <span style={{ display: "block", fontSize: "0.8rem" }}>Reviewer note</span>
                <textarea
                  defaultValue={p.review_note ?? ""}
                  style={{ width: "100%", minHeight: "3rem", fontSize: "0.8rem" }}
                  onBlur={(e) => onNoteSave(p.id, e.target.value.trim() || null)}
                />
              </label>
              <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.1rem" }}>
                {noteStatus[p.id] === "saving"
                  ? "Saving…"
                  : noteStatus[p.id] === "saved"
                  ? "Saved"
                  : noteStatus[p.id] === "error"
                  ? "Save failed"
                  : "\u00a0"}
              </p>
              <div style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}>
                {p.allowed_actions.length > 0 ? (
                  <>
                    <span>Actions: </span>
                    {p.allowed_actions.map((a) => (
                      <button
                        key={a}
                        type="button"
                        style={{ marginRight: "0.25rem", fontSize: "0.75rem" }}
                        disabled={busyKey === `${p.id}:${a}`}
                        onClick={() => onAction(p.id, a)}
                      >
                        {busyKey === `${p.id}:${a}` ? "…" : a}
                      </button>
                    ))}
                  </>
                ) : (
                  <span>No actions (terminal or gated)</span>
                )}
              </div>
              {actionError[p.id] ? (
                <p style={{ fontSize: "0.75rem", color: "#b00", marginTop: "0.15rem" }}>
                  {actionError[p.id]}
                </p>
              ) : null}
              <p>
                <a href={`/review/proposals/${p.id}`} target="_blank" rel="noreferrer">
                  Open proposal review
                </a>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HabitatSection({
  groups,
  onAction,
  onNoteSave,
  busyKey,
  noteStatus,
  actionError,
}: {
  groups: HabitatGroup[];
  onAction: (id: string, action: string) => void;
  onNoteSave: (id: string, note: string | null) => void;
  busyKey: string | null;
  noteStatus: Record<string, "idle" | "saving" | "saved" | "error">;
  actionError: Record<string, string | null>;
}) {
  if (!groups.length) return null;
  return (
    <section>
      <h2>Habitat staging (grouped by page)</h2>
      <p>
        Habitat proposals are grouped by staging page slug where available. Use this to
        review all changes targeting the same public surface together.
      </p>
      {groups.map((group) => (
        <article key={group.slug} style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.75rem" }}>
          <details open>
            <summary style={{ cursor: "pointer" }}>
              <strong>Page:</strong> <code>{group.slug}</code>{" "}
              <span style={{ fontSize: "0.85rem", color: "#555" }}>
                ({group.proposals.length} proposal{group.proposals.length === 1 ? "" : "s"})
              </span>
            </summary>
          {group.title ? <p>Title: {group.title}</p> : null}
          <p>
            Proposals: {group.proposals.length}
            {group.updated_at ? <> · last updated: {new Date(group.updated_at).toLocaleString()}</> : null}
          </p>
          <ul>
            {group.proposals.map((p) => (
              <li key={p.id}>
                <strong>{p.title ?? "(untitled proposal)"}</strong>{" "}
                <span>— state: {p.proposal_state}</span>{" "}
                {p.proposal_role ? <span> · role: {p.proposal_role}</span> : null}
                <div>
                  {p.summary ? <p>{p.summary}</p> : null}
                  <label style={{ display: "block", marginTop: "0.25rem" }}>
                    <span style={{ display: "block", fontSize: "0.8rem" }}>Reviewer note</span>
                    <textarea
                      defaultValue={p.review_note ?? ""}
                      style={{ width: "100%", minHeight: "3rem", fontSize: "0.8rem" }}
                      onBlur={(e) => onNoteSave(p.id, e.target.value.trim() || null)}
                    />
                  </label>
                  <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.1rem" }}>
                    {noteStatus[p.id] === "saving"
                      ? "Saving…"
                      : noteStatus[p.id] === "saved"
                      ? "Saved"
                      : noteStatus[p.id] === "error"
                      ? "Save failed"
                      : "\u00a0"}
                  </p>
                  <div style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}>
                    {p.allowed_actions.length > 0 ? (
                      <>
                        <span>Actions: </span>
                        {p.allowed_actions.map((a) => (
                          <button
                            key={a}
                            type="button"
                            style={{ marginRight: "0.25rem", fontSize: "0.75rem" }}
                            disabled={busyKey === `${p.id}:${a}`}
                            onClick={() => onAction(p.id, a)}
                          >
                            {busyKey === `${p.id}:${a}` ? "…" : a}
                          </button>
                        ))}
                      </>
                    ) : (
                      <span>No actions (terminal or gated)</span>
                    )}
                  </div>
                  {actionError[p.id] ? (
                    <p style={{ fontSize: "0.75rem", color: "#b00", marginTop: "0.15rem" }}>
                      {actionError[p.id]}
                    </p>
                  ) : null}
                  <p>
                    <a href={`/review/proposals/${p.id}`} target="_blank" rel="noreferrer">
                      Open proposal review
                    </a>
                  </p>
                </div>
              </li>
            ))}
          </ul>
          </details>
        </article>
      ))}
    </section>
  );
}

function PublishReviewPanel({ state }: { state: PublishReviewState }) {
  if (state.loading) {
    return (
      <section>
        <h2>Publish readiness</h2>
        <p>Loading publish readiness review…</p>
      </section>
    );
  }

  if (state.error) {
    return (
      <section>
        <h2>Publish readiness</h2>
        <p>Unable to load publish readiness review: {state.error}</p>
      </section>
    );
  }

  if (!state.review) {
    return (
      <section>
        <h2>Publish readiness</h2>
        <p>No publish readiness review available.</p>
      </section>
    );
  }

  const { review } = state;
  const diff = review.diff;
  const flags = review.advisory_flags;

  return (
    <section>
      <h2>Publish readiness</h2>
      <p>
        Identity: <code>{review.identity_id}</code>
      </p>
      <p>Reviewed at: {new Date(review.reviewed_at).toLocaleString()}</p>
      <p>
        Current public snapshot id:{" "}
        {diff.current_public_snapshot_id ? <code>{diff.current_public_snapshot_id}</code> : "none"}
      </p>
      <h3>Diff summary</h3>
      <ul>
        <li>Avatar changed: {diff.avatar_changed ? "yes" : "no"}</li>
        <li>Layout changed: {diff.layout_changed ? "yes" : "no"}</li>
        <li>Blocks added: {diff.blocks_added}</li>
        <li>Blocks removed: {diff.blocks_removed}</li>
        <li>Blocks changed: {diff.blocks_changed}</li>
        <li>Extensions changed: {diff.extensions_changed ? "yes" : "no"}</li>
        <li>Significance: {diff.significance}</li>
      </ul>
      <h3>Advisory flags</h3>
      <ul>
        <li>Likely duplicate: {flags.likely_duplicate ? "yes" : "no"}</li>
        <li>Likely reversion: {flags.likely_reversion ? "yes" : "no"}</li>
        <li>High recent volatility: {flags.high_recent_volatility ? "yes" : "no"}</li>
        <li>Too soon since last public: {flags.too_soon_since_last_public ? "yes" : "no"}</li>
        <li>No current public: {flags.no_current_public ? "yes" : "no"}</li>
      </ul>
      <h3>Recommendation</h3>
      <p>
        <strong>{review.recommendation}</strong>
      </p>
      {review.recommendation_notes.length ? (
        <ul>
          {review.recommendation_notes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function StagingReviewClient() {
  const [model, setModel] = useState<StagingReviewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<PublishReviewState>({
    loading: true,
    error: null,
    review: null,
  });
  const [promoting, setPromoting] = useState(false);
  const [busyProposalAction, setBusyProposalAction] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({});
  const [actionError, setActionError] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [modelRes, publishRes] = await Promise.all([
          fetch("/api/staging/review").then((r) => r.json()),
          fetch("/api/staging/publish-review").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setModel(modelRes as StagingReviewModel);
        if (publishRes && publishRes.review) {
          setPublishState({
            loading: false,
            error: null,
            review: publishRes.review as PublishReview,
          });
        } else {
          setPublishState({
            loading: false,
            error: null,
            review: null,
          });
        }
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load staging review.");
        setPublishState({
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load publish review.",
          review: null,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePromote() {
    try {
      setPromoting(true);
      const res = await fetch("/api/staging/promote", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          (data && typeof data.error === "string" && data.error) ||
          `Promotion failed with status ${res.status}`;
        alert(message);
      } else {
        // Refresh both staging model and publish review after promotion.
        const [modelRes, publishRes] = await Promise.all([
          fetch("/api/staging/review").then((r) => r.json()),
          fetch("/api/staging/publish-review").then((r) => r.json()),
        ]);
        setModel(modelRes as StagingReviewModel);
        if (publishRes && publishRes.review) {
          setPublishState({
            loading: false,
            error: null,
            review: publishRes.review as PublishReview,
          });
        }
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Promotion failed.");
    } finally {
      setPromoting(false);
    }
  }

  const hasHabitat =
    model && model.buckets.habitat.groups.some((g) => g.proposals.length > 0);

  async function refreshAll() {
    const [modelRes, publishRes] = await Promise.all([
      fetch("/api/staging/review").then((r) => r.json()),
      fetch("/api/staging/publish-review").then((r) => r.json()),
    ]);
    setModel(modelRes as StagingReviewModel);
    if (publishRes && publishRes.review) {
      setPublishState({
        loading: false,
        error: null,
        review: publishRes.review as PublishReview,
      });
    }
  }

  async function handleNoteSave(id: string, note: string | null) {
    try {
      setNoteStatus((prev) => ({ ...prev, [id]: "saving" }));
      await fetch(`/api/staging/proposal/note?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_note: note }),
      });
      setNoteStatus((prev) => ({ ...prev, [id]: "saved" }));
      await refreshAll();
    } catch {
      setNoteStatus((prev) => ({ ...prev, [id]: "error" }));
    }
  }

  async function handleProposalAction(id: string, action: string) {
    try {
      setBusyProposalAction(id + ":" + action);
      const res = await fetch(`/api/staging/proposal/action?id=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json.error || `Action failed with status ${res.status}`;
        setActionError((prev) => ({ ...prev, [id]: message }));
        return;
      }
      setActionError((prev) => ({ ...prev, [id]: null }));
      await refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Action failed.";
      setActionError((prev) => ({ ...prev, [id]: msg }));
    } finally {
      setBusyProposalAction(null);
    }
  }

  return (
    <div>
      <section>
        <h2>Staging controls</h2>
        <p>
          Review grouped staging proposals across lanes, inspect publish-readiness,
          then promote the current staging composition to the public snapshot chain.
        </p>
        <p>
          <a href="/review/staging/preview" target="_blank" rel="noreferrer">
            Open candidate habitat preview
          </a>
        </p>
        <button type="button" onClick={handlePromote} disabled={promoting || !hasHabitat}>
          {promoting ? "Promoting…" : "Publish staging to public"}
        </button>
        {!hasHabitat ? (
          <p>No habitat staging pages detected. Approve proposals for staging to enable publish.</p>
        ) : null}
      </section>

      <PublishReviewPanel state={publishState} />

      {loading && !model ? <p>Loading staging buckets…</p> : null}
      {error ? <p>Failed to load staging buckets: {error}</p> : null}

      {model ? (
        <>
          <HabitatSection
            groups={model.buckets.habitat.groups}
            onAction={handleProposalAction}
            onNoteSave={handleNoteSave}
            busyKey={busyProposalAction}
            noteStatus={noteStatus}
            actionError={actionError}
          />
          <BucketSection
            title="Artifact-related proposals"
            description="Artifact-lane proposals and proposal-intent artifacts routed through the gating layer."
            proposals={model.buckets.artifacts.proposals}
            onAction={handleProposalAction}
            onNoteSave={handleNoteSave}
            busyKey={busyProposalAction}
            noteStatus={noteStatus}
            actionError={actionError}
          />
          <BucketSection
            title="Critique-related proposals"
            proposals={model.buckets.critiques.proposals}
            onAction={handleProposalAction}
            onNoteSave={handleNoteSave}
            busyKey={busyProposalAction}
            noteStatus={noteStatus}
            actionError={actionError}
          />
          <BucketSection
            title="Extension-related proposals"
            proposals={model.buckets.extensions.proposals}
            onAction={handleProposalAction}
            onNoteSave={handleNoteSave}
            busyKey={busyProposalAction}
            noteStatus={noteStatus}
            actionError={actionError}
          />
          <BucketSection
            title="System proposals"
            description="System-lane proposals. Review with extra care; these often affect foundational behaviors."
            proposals={model.buckets.system.proposals}
            onAction={handleProposalAction}
            onNoteSave={handleNoteSave}
            busyKey={busyProposalAction}
            noteStatus={noteStatus}
            actionError={actionError}
          />
        </>
      ) : null}
    </div>
  );
}

