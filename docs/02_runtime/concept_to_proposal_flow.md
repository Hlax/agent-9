# Concept-to-proposal flow

Operational rules for when a concept artifact becomes a surface or system proposal, when the agent may build in staging, and how approval moves to publication.

Canon: artifact generation is separate from governance; approval is separate from publication; staging is separate from public release.

---

## 1. Best V1 flow

```
Concept artifact
  → self critique + evaluation
  → proposal eligibility check
  → proposal record created (if eligible or Harvey override)
  → Harvey approves proposal
  → agent builds in staging (optional; only after approved_for_staging)
  → Harvey reviews staging result
  → approve for publication
  → publish to public
```

- **Artifact layer:** concept artifact is generated, critiqued, evaluated, enters review.
- **Proposal layer:** proposal is created (draft/eligible → pending_review), Harvey approves → approved_for_staging → (build) → staged → approved_for_publication → published, or rejected/needs_revision/archived.
- **Deployment layer:** staging build (build_requested → build_complete → preview_ready); promotion to public only after Harvey approves for publication.

---

## 2. When a concept becomes a proposal

A concept artifact does **not** automatically become a proposal just because it exists. It must cross a **threshold** or receive **Harvey override**.

### Proposal eligibility (threshold)

A concept artifact is **proposal-eligible** when **all** of the following hold:

| Condition | Rule |
|-----------|------|
| Medium | `medium === "concept"` |
| Alignment | `alignment_score >= 0.60` |
| Fertility | `fertility_score >= 0.70` |
| Pull | `pull_score >= 0.60` |
| Critique outcome | `critique_outcome` in `{ continue, branch, shift_medium }` |
| Not already rejected | No existing proposal for this artifact in state `rejected` or `archived` (for same lane/target). |

Rationale:

- **Alignment** — fits current direction.
- **Fertility** — opens real next steps.
- **Pull** — system believes the direction wants continuation.
- **Critique outcome** — continue/branch/shift_medium indicate the work is alive; stop/archive_candidate do not.

Additional triggers (any one is sufficient to allow creating a proposal, even if threshold fails):

- **Harvey override** — Harvey explicitly chooses "Turn this into a proposal".

Implementation may run the eligibility check after each session that produces a concept artifact; if eligible, create a `proposal_record` with `proposal_state = "pending_review"`. Harvey can always create a proposal manually from a concept (override).

---

## 3. When the agent is allowed to build in staging

- The agent **may** build in staging **only after** a proposal has been approved for staging by Harvey (`proposal_state = "approved_for_staging"`).
- The agent **may not** self-publish, self-approve governance changes, or promote to public.
- Building in staging means: generate implementation patch / stage preview / deploy to staging habitat. Harvey then reviews the staging result.

**Mode A — Proposal only** (e.g. governance, risky system changes):

- Create proposal, rationale, target surface; wait for Harvey. No staging build by agent.

**Mode B — Proposal + staging build** (e.g. layout, studio UI, habitat experiments):

- Create proposal; when Harvey approves for staging, agent may generate implementation and deploy to staging; Harvey reviews staging, then may approve for publication.

---

## 4. Gate from approved to published

- **Approval for staging** (`approved_for_staging`) — Harvey agrees the proposal should be implemented in staging. This is the gate for the agent to build in staging. For habitat proposals, approving for staging **merges** the proposal payload into the **staging composition** (first-class staging_habitat_content table); staging is no longer “proposal rows only” but a mutable branch/workspace.
- **Staging composition** — The current staging habitat is a coherent composition (one row per page in staging_habitat_content). The Twin can keep refining staging as more proposals are approved; each approval merges into this composition (per-page replace). The staging app renders from the composition.
- **Approval for publication** (`approved_for_publication`) — Harvey has reviewed the staging result and agrees it may go to public. This is the gate for publishing to public. Legacy path: single-proposal approve_for_publication still writes that proposal to public_habitat_content.
- **Publish / Promote** — Human-triggered **“Push staging to public”** copies the current staging composition to public (promotion). No runner or Twin self-publish. Optional: approve_for_publication remains for one-proposal-to-public; the primary path is promote staging → public.
- **Promotion record** — Each push is recorded in habitat_promotion_record (audit and provenance).

So: **approved → merge into staging composition → Harvey reviews staging → push staging to public (or approve for publication for single proposal).**

---

## 5. Proposal states (V1)

| State | Meaning |
|-------|---------|
| `pending_review` | New or eligible; awaiting Harvey. |
| `approved_for_staging` | Harvey approved for staging; agent may build in staging. |
| `staged` | Build in staging is done; awaiting Harvey review. |
| `needs_revision` | Harvey requested changes. |
| `approved_for_publication` | Harvey approved after reviewing staging; ready to publish. |
| `published` | Promoted to public. |
| `rejected` | Rejected by Harvey. |
| `archived` / `ignored` | Archived or ignored. |

Backward compatibility: existing `approved` remains valid; new flows use `approved_for_staging` and `approved_for_publication` where appropriate.

---

## 6. Data linkage

Run migration `20250310000001_proposal_record_concept_fields.sql` so `proposal_record` has `artifact_id`, `target_surface`, `proposal_type`.

- **proposal_record** for concept-sourced proposals:
  - `artifact_id` — source concept artifact.
  - `lane_type` — `surface` or `system`.
  - `target_type` — e.g. `concept`, `public_layout`, `studio_workflow`.
  - `target_surface` — `studio` | `staging_habitat` | `public_habitat`.
  - `proposal_type` — e.g. `layout`, `component`, `navigation`, `workflow`.

### 6.1 Audit / canon mapping: lane_type and target_type

External audits may refer to **surface_proposal**, **system_proposal**, or **canon_proposal**. In this codebase and data model we use **lane_type** and **target_type** only:

| Audit / doc term   | Implementation                          |
|--------------------|------------------------------------------|
| **surface_proposal** | `proposal_record.lane_type = 'surface'` |
| **system_proposal**  | `proposal_record.lane_type = 'system'`  |
| **canon_proposal**   | Not a separate type. Treat as system proposals that affect governance, runtime behaviour, or identity structure (e.g. `target_type` for identity_name, avatar_candidate, or future governance_document). Approved system/canon changes are recorded in `change_record` (see change_record_system.md). |

- **target_type** examples: `concept`, `identity_name`, `avatar_candidate`, `public_habitat_proposal`, `habitat`, plus any future governance or runtime types.
- **change_record** is written when Harvey approves identity (apply_name), embodiment (approve_avatar), habitat (approve_for_publication), or any proposal with `lane_type = 'system'`.

---

## 7. Decision input for the agent (proposal planner)

When the agent considers creating proposals or building in staging, it should use:

- Latest creative state snapshot
- Review backlog (pending proposals, pending artifacts)
- Current active surfaces
- Current branch/build state
- Recent approved concepts and rejected proposals
- Current staging vs public version
- Whether the proposal is reversible
- Whether the domain is governance (no self-activate) vs surface (may build in staging after approval)

Session loop already loads identity, sessions, threads, archive, memory, artifacts, and creative state; add a **proposal planner** step after concept evaluation for eligible concepts. Optional: ecology layer may give **near-eligible** concepts (just under threshold) a slight continuation/return weight—see `creative_ecology.md` §5.1.
