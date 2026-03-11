## Light Operational Ontology (canon v2)

This document defines a **small, operational vocabulary** for Twin_V2.
It is designed to:

- Improve **steering consistency**.
- Make **decision traces** easier to read.
- Clarify **staging vs public** governance.
- Provide a stable base for **future extensibility** without refactors.

It does **not** introduce a knowledge graph, large taxonomies, or new schemas.
All terms map directly onto current runtime behavior and canon_v2.

Cross‑references:

- Agent decisions: `05_agent/agent_decision_canon.md`
- Data model: `01_foundation/data_model.md`
- Runtime: `02_runtime/session_orchestrator.md`, `02_runtime/creative_metabolism.md`
- Governance: `03_governance/state_machines.md`, `03_governance/audit_and_change_records.md`
- Public surfaces: `04_surfaces/public_habitat_and_avatar.md`

---

### 1. Authority / governance vocabulary

These terms describe **where** a decision lives and **how** it is governed.
They map directly to the three‑zone model and decision classes in the Agent Decision Canon.

#### 1.1 `authority_zone`

High‑level place where a decision or effect belongs:

- `inner` — autonomous creative self‑steering inside a session.
- `staging` — Twin‑driven shaping of **staging UI/surface** (concepts and proposals only; no direct public writes).
- `public` — human‑ratified public identity and habitat (avatar, name, public pages, publication).
- `system_governed` — system/workflow and runtime settings that must remain governed and auditable.

These zones are conceptual and appear primarily in **docs and traces**; code enforces boundaries via routes and FSMs.

#### 1.2 `decision_class`

How a decision is allowed to be taken:

- `autonomous` — Twin decides and executes fully inside a session (e.g. mode, drive, focus, creative state, archive entries, memory).
- `autonomous_staging` — Twin may shape **staging surfaces** more freely (intended; today represented through proposals, traces, and UI).
- `proposal_only` — Twin may create / refresh proposals but **may not apply them** (e.g. habitat_layout, avatar_candidate).
- `human_gated` — Requires authenticated human action and FSM checks (e.g. approval, publication, identity and habitat application).
- `privileged_override` — Manual human override paths that bypass proposals but must remain auditable (e.g. identity PATCH, runtime config).

These labels are used in canon and can be referenced in traces and UI.

#### 1.3 `surface_lane`

Where a piece of content or proposal is intended to show up:

- `internal` — strictly internal runtime or operator views (e.g. tools, traces).
- `staging` — visible in staging UI/surfaces but not yet public (e.g. layout or avatar candidates).
- `public` — visible on public surfaces (artifacts, habitat, avatar).

Today `lane_type = "surface"` in `proposal_record` is the main realized lane; these ontology labels help clarify staging vs public intent.

#### 1.4 `promotion_path`

How something is expected to move from internal to public:

- `stage_only` — intended to circulate in staging only (e.g. some internal layouts or tools).
- `stage_then_publish` — intended path: Twin proposes → staging → human approval → public publish.
- `proposal_only` — proposals that express intent but are not expected to be auto‑applied (e.g. some system lanes).
- `manual_only` — changes that are only made via privileged overrides (e.g. some runtime config, emergency fixes).

These labels are **descriptive** and appear in docs and traces; enforcement is via routes and FSMs, not these strings.

---

### 2. Steering vocabulary

These terms describe **how the Twin is moving** creatively.
They are designed to show up in decision summaries, deliberation traces, and debug UIs.

#### 2.1 `drive` (existing)

Drive values are defined in `@twin/evaluation` and surfaced as `CreativeDrive`.
The ontology treats them as the **primary steering signal** and does not rename them here.

#### 2.2 `narrative_state`

Compact description of the **current creative posture** of a session:

- `expansion` — exploring new territory or generating fresh material.
- `reflection` — reflecting on past work, tension, or identity (high reflection_need).
- `return` — returning to archived or paused work (archive entries and recurrence pull).
- `curation_pressure` — under pressure from backlog / public curation load (high backlog, many proposals).
- `stalled` — repeated patterns or repetition without clear movement (high repetition signal).

In v2 runtime this is computed in `session-runner` and emitted to:

- `deliberation_trace.observations_json.narrative_state`
- `deliberation_trace.state_summary` (as an inline label)

#### 2.3 `tension_kind`

Named sources of creative tension:

- `backlog_pressure` — too many pending proposals or habitat layout candidates.
- `recurrence_pull` — high recurrence scores pulling ideas/threads back.
- `unfinished_pull` — many archive candidates or unfinished work.
- `surface_pressure` — high public curation backlog (public_habitat_content + surfacing needs).
- `identity_pressure` — low avatar_alignment or unclear identity/name.

These labels can be listed in `tensions_json.tension_kinds` or similar helper structures to explain why the current narrative_state was chosen.

#### 2.4 `selection_reason` (existing, normalized)

Compact codes for **why focus was chosen**:

- `archive_return_due_to_mode` — return mode selected focus from archive.
- `project_thread_default` — selected from active project/thread/idea by recurrence/creative_pull weighting.
- `explicit_preference` — caller or operator explicitly steered the selection.

These already appear in `deliberation_trace.hypotheses_json.selection_reason` and are considered part of the ontology.

---

### 3. Proposal / artifact vocabulary

These terms describe artifacts and proposals **as they relate to surfaces and identity**.
They align with the proposal and habitat/avatar model.

#### 3.1 `artifact_role`

Short label describing an artifact’s operational role:

- `layout_concept` — concept artifact used to drive habitat layout / surface structure (cron + concept; implemented).
- `image_concept` — image artifact used as a candidate for avatar or visual identity (cron + image; implemented).
- `reflection` — reflective or self‑critique artifact (reserved; may be wired later).
- `writing_fragment` — more general writing artifact not tied to layout (reserved).

Today, `layout_concept` and `image_concept` are set by `inferArtifactRole` in the session runner and stored in `artifact.artifact_role` when present.

#### 3.2 `proposal_role`

Short label describing **what a proposal is for**:

- `habitat_layout` — proposal to shape **staging habitat layout** based on a concept artifact (implemented).
- `avatar_candidate` — proposal to nominate a new avatar image candidate (implemented).
- `naming_candidate` — proposal to set or update identity name (reserved; some routes already treat `identity_name` as target_type).
- `surface_adjustment` — proposal to adjust staging surfaces or UI elements (reserved).
- `system_change_proposal` — proposal to update system or workflow behavior (reserved; today system lanes exist but behavior is limited).

Runtime uses `proposal_role` when inserting surface proposals.

#### 3.2.1 `proposal_type` vs `proposal_role`

Two related fields appear in `proposal_record` and traces:

- `proposal_type` — an **operational bucket** used by routes and pipeline code (e.g. `"surface"`, `"avatar"`, `"system"`). This is primarily implementation-facing and may stay close to how APIs or staging flows are wired.
- `proposal_role` — the **semantic intent** of the proposal (e.g. `"avatar_candidate"`, `"habitat_layout"`, `"naming_candidate"`). This is the better label for ontology/debug/operator interpretation.

In canon v2, a proposal may have:

- One operational **type** (`proposal_type`) and
- One semantic **role** (`proposal_role`).

Operators and ontology-powered UIs should prefer `proposal_role` when explaining what a proposal is for, and treat `proposal_type` as a lower-level routing/pipeline category.

#### 3.3 `target_surface`

Where the proposal is intended to apply:

- `staging_habitat` — staging habitat layout (implemented for `habitat_layout` proposals).
- `identity` — Twin’s identity surface (implemented for `avatar_candidate` proposals as a logical target, even though `target_surface` may be null in some existing rows).
- `public_habitat` — public habitat content (applied via approve routes, not directly by the Twin).
- `studio_ui_preview` — internal studio views and previews (reserved for debug / operator surfaces).

`target_surface` is stored in `proposal_record.target_surface` when present.

#### 3.4 `presentation_intent`

Describes how a piece of content is intended to be seen:

- `exploratory` — early, rough, or divergent outputs used for exploration.
- `candidate` — a specific candidate for selection (e.g. avatar_candidate, habitat layout).
- `staged` — prepared for staging presentation but not yet public.
- `publishable` — meets gates for potential publication (still requires explicit human approval).

These labels are primarily used in **traces and summaries**, not stored as separate DB fields in v2.

---

### 4. Trace / reasoning vocabulary

These terms help keep **deliberation traces** compact and legible.

#### 4.1 `evidence_kind`

Types of evidence cited in a decision:

- `creative_state` — numeric creative state fields and derived narrative_state.
- `memory` — memory_record rows and reflective notes.
- `archive` — archive_entry rows and recurrence/creative_pull.
- `proposal_backlog` — counts and states of proposals.
- `project_context` — project and thread labels and summaries.
- `idea_context` — idea summaries and status.

These can be listed inside `evidence_checked_json.evidence_kinds` to show what the Twin looked at when deciding.

#### 4.2 `chosen_action` (natural language) and `action_kind` (ontology)

Two layers:

- `chosen_action` — free‑form natural language description (already stored as `deliberation_trace.chosen_action` and `decision_summary.next_action`).
- `action_kind` — compact ontology label describing the class of action, e.g.:
  - `continue_thread` — continue within the current thread/idea.
  - `resurface_archive` — bring an archive candidate back into focus.
  - `generate_avatar_candidate` — create a new avatar_candidate proposal.
  - `generate_habitat_candidate` — create or refresh a habitat_layout proposal.
  - `defer_publication` — keep work internal or in staging without publishing.

In v2 runtime, `action_kind` is emitted inside `deliberation_trace.hypotheses_json`.

#### 4.3 `confidence_band`

Compact description of confidence:

- `low` — decision_summary.confidence below a lower threshold.
- `medium` — confidence in a middle range.
- `high` — confidence above an upper threshold.

Exact thresholds are **heuristics** (implementation‑defined) and can be tuned without changing this canon.
`confidence_band` is emitted inside `deliberation_trace.hypotheses_json` alongside numeric confidence.

---

### 5. Memory vocabulary

These terms describe how memories are categorized and used.

#### 5.1 `memory_kind`

Categories of memory:

- `episodic` — specific session events or moments.
- `reflective` — higher‑level reflections on patterns or learning.
- `evaluative` — evaluations and signals about quality or alignment.
- `curatorial` — notes about what should be surfaced, archived, or curated.
- `identity_signal` — memories that affect identity, values, or embodiment.

The current schema uses `memory_type` as a string (e.g. `session_reflection`); these ontology labels can be used in new memory types as the system evolves.

#### 5.2 `memory_use`

How a memory is used at decision time:

- `steer_mode` — influence session mode or drive.
- `steer_focus` — influence which project/thread/idea is chosen.
- `justify_proposal` — support creating or preferring a proposal.
- `support_return` — support returning to archived work.
- `explain_choice` — provide narrative justification in traces or UI.

These labels can appear in deliberation trace or tool‑specific metadata when memories are consulted.

---

### 6. Implementation notes (v2)

In the current runtime, this ontology is used **lightly and operationally**:

- `artifact_role` uses `layout_concept` and `image_concept` (session runner).
- `proposal_role` uses `habitat_layout` and `avatar_candidate` for surface proposals.
- `target_surface` uses `staging_habitat` for layout proposals and is conceptually `identity` for avatar candidates.
- `selection_reason` codes (`archive_return_due_to_mode`, `project_thread_default`, `explicit_preference`) are treated as part of the ontology.
- `narrative_state`, `action_kind`, and `confidence_band` are derived in the session runner and emitted into deliberation traces.

These terms are intentionally **few** and **directly actionable**. Future work may add more labels, but only when they have clear behavioral or explanatory value.

