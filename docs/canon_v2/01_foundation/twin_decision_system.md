# Twin decision system (canon)

This document is the **foundational canon** for how the Twin moves from concept and state into artifact creation and governed proposals. It is implementation-aware and defines the smallest next semantic layer the repository can align with.

**Cross-references:** data_model.md, light_ontology.md, creative_metabolism.md, session_orchestrator.md, 03_governance/state_machines.md.

---

## Purpose

The canon defines:

1. The **decision pipeline**: state and evidence → session mode → drive → focus → concept intent → preferred medium → artifact role → proposal eligibility → proposal role → target surface → execution lane → trace.
2. A **small concept-intent layer**: what an artifact is meant to be, distinct from the medium it is expressed in.
3. The **distinction** between artifact medium, artifact role, proposal role, and presentation intent.
4. **Governance lanes**: what the Twin may generate, propose, stage, or never mutate.
5. **Observability expectations**: what must be logged, persisted, and visible to operators.
6. **Implementation status** of each layer so the repo can align without speculation.

---

## Decision pipeline

The chain below is in **execution order**: each step runs in this sequence in the current implementation. Definitions are operational and implementation-aware.

| Step | Meaning operationally |
|------|------------------------|
| **State and evidence** | Latest creative state (from last snapshot or default) and live proposal backlog. Loaded once per session. Feeds mode, drive, and caps. |
| **Session mode** | One of: explore, return, reflect, continue, rest. Derived from creative state thresholds. **Only "return"** changes behavior today (focus from archive); other modes share project/thread focus and are passed as a label into the generation prompt. |
| **Drive** | One of: coherence, expression, emergence, expansion, return, reflection, curation, habitat. Selected probabilistically from weights derived from creative state. Stored and traced; **not** passed into generation prompts today. |
| **Focus selection** | Project, thread, and optionally idea—or an archive entry. In return mode with archive entries: scored and taste-biased; else: project/thread selection by recurrence and creative_pull. Determines workingContext and sourceContext for generation. |
| **Preferred medium** | writing \| concept \| image \| null. **Selected operationally before generation.** Explicit from caller wins; else derived from state (reflection/unfinished → concept; avatar/backlog or diversity/tension → image; cron 12% image; else writing). Steers generation path and, for concept, adds habitat guidance to the prompt. |
| **Generation** | One writing/concept or image artifact produced by the pipeline using mode, focus context, and preferred medium. Session and artifact rows are inserted in a later persistence stage; generation itself only produces in-memory result. |
| **Concept intent (inferred)** | Semantic label for *what* the artifact is meant to be (e.g. thread_continuation, layout_spec, avatar_exploration). **Currently inferred after the fact** from medium, path, and result semantics—not chosen as a first-class pre-generation control. Explicit concept intent (chosen or derived before generation and passed into the prompt) is the **smallest next semantic layer** for future wiring. |
| **Artifact role** | Operational label on the artifact (e.g. layout_concept, image_concept). Inferred from medium + cron after generation. Used for trace, UI, and filtering; proposal creation branches on **medium**, not role. |
| **Proposal eligibility** | Concept artifacts: medium concept, critique_outcome continue/branch/shift_medium, alignment ≥ 0.6, fertility ≥ 0.7, pull ≥ 0.6. Image: no eligibility function; creation gated by cap and no duplicate proposal for same artifact. |
| **Proposal role** | Semantic label on the proposal: habitat_layout (concept → staging), avatar_candidate (image → identity). Determines target_surface and downstream approval routes. |
| **Target surface** | Where the proposal is intended to apply: staging_habitat, identity. Stored on proposal_record. |
| **Execution lane** | Internal vs surface vs system. Surface lane: proposals for habitat or avatar; creation and caps enforced in manageProposals. No direct public or identity mutation. |
| **Trace** | creative_session.trace, creative_session.decision_summary, deliberation_trace (observations, evidence, hypotheses, chosen_action, confidence), trajectory_review. All written after the run; no feedback into next run except via creative_state_snapshot and backlog. |

---

## Core decision vocabulary

- **Session mode:** explore | return | reflect | continue | rest. Affects focus source when return; otherwise descriptive and prompt label.
- **Drive:** coherence | expression | emergence | expansion | return | reflection | curation | habitat. Steering vocabulary; today stored and traced only.
- **Selection source:** archive | project_thread | explicit_preference. Why focus was chosen; persisted in deliberation.
- **Preferred medium:** writing | concept | image. Steers generation path and concept prompt.
- **Artifact role:** layout_concept | image_concept | (reserved: reflection, writing_fragment). Set from medium + context after generation.
- **Proposal role:** habitat_layout | avatar_candidate | (reserved: naming_candidate, surface_adjustment, system_change_proposal).
- **Target surface:** staging_habitat | identity | (reserved: public_habitat, studio_ui_preview).
- **Narrative state:** expansion | reflection | return | curation_pressure | stalled. Post-hoc classification for trace/UI.
- **Action kind:** continue_thread | resurface_archive | generate_habitat_candidate | generate_avatar_candidate. Post-hoc classification for trace/UI.

---

## Concept intent

**Concept intent** is the semantic answer to: *what is this artifact meant to be?* It is **distinct from medium**: text may be the medium while the intent is an image prompt or a system proposal.

### Categories (minimal set)

| Intent | Meaning | Implementation status |
|--------|---------|------------------------|
| **thread_continuation** | Continuing or deepening work within the selected thread/idea. | Partially implemented: focus selection provides thread/idea context; no explicit intent field. |
| **layout_spec** | Habitat or staging layout concept (structure, mood, blocks). | Implemented: concept medium + CONCEPT_HABITAT_GUIDANCE in prompt; no separate intent field. |
| **avatar_exploration** | Image intended as avatar/identity candidate. | Implemented: image medium and avatar proposal path; no separate intent field. |
| **reflection** | Reflective or self-critique writing. | Reserved: session mode "reflect" exists but does not change prompt or intent. |
| **image_prompt** | Text that describes an image (not yet generated). | Reserved. |
| **naming_exploration** | Exploration of identity name. | Reserved; naming_candidate proposal role exists in canon. |
| **surface_adjustment** | Staging UI/surface adjustment. | Reserved. |
| **system_change** | System or workflow change proposal. | Reserved; system lanes in UI/canon. |

### How concept intent differs from medium

- **Medium** is the *form* of the artifact: writing, concept (text with habitat guidance), or image. It steers the generation path and prompt today.
- **Concept intent** is the *purpose* of the artifact: what it is for. Today the system infers intent only from medium and path (concept → layout_spec; image → avatar_exploration). The smallest next layer is one explicit field (e.g. concept_intent or artifact_intent) set from mode/medium or a simple classifier and passed into the prompt so the model can adjust tone and content. No large taxonomy; a small enum or short list is sufficient.

---

## Medium vs role vs proposal

### Artifact medium

The **form** of the creative output: `writing`, `concept`, or `image`. Determines generation path (writing vs image) and, for concept, whether habitat guidance is added to the prompt. Stored on `artifact.medium`.

### Artifact role

The **operational label** of the artifact (e.g. layout_concept, image_concept). Inferred from medium + context (e.g. cron) *after* generation. Stored on `artifact.artifact_role`. Used for trace, eligibility APIs, and UI. Proposal creation in the runner branches on **medium**, not artifact_role.

**Principle:** Text may be the medium while the role could (in a future layer) be image_prompt or system_change; today role is derived only from medium + cron.

### Proposal role

The **semantic intent of the proposal**: what the proposal is for (e.g. habitat_layout, avatar_candidate). Set when creating a proposal_record. Determines target_surface and which approval/apply routes apply. Implemented: habitat_layout, avatar_candidate. Reserved: naming_candidate, surface_adjustment, system_change_proposal.

### Presentation intent

How content is intended to be seen: exploratory, candidate, staged, publishable. **Reserved** for traces and summaries; not stored as a DB field today. Used in light_ontology.md for future operator interpretation.

---

## Governance lanes

### What the Twin may do

| Action | Allowed | Boundary |
|--------|---------|----------|
| **Generate automatically** | Yes. One or more artifacts per session (writing, concept, or image). Artifacts are pending_review, private. | Generation only; no self-approval or self-publication. |
| **Propose automatically** | Yes. Create or refresh proposal_record rows when eligible and under caps (habitat_layout from concept, avatar_candidate from image). | Proposals start in pending_review; Twin does not transition state or apply. |
| **Stage automatically** | No. Staging (approved_for_staging, staged) is a human-gated transition. Twin may create proposals that are *candidates* for staging. | |
| **Mutate public or identity directly** | No. Public habitat content and identity (name, avatar) are updated only via approval routes and human action. | |

### Boundaries

- **Creative generation:** Twin runs the session pipeline (mode, drive, focus, medium, generation, critique, evaluation). Output: creative_session, artifact, critique_record, evaluation_signal, creative_state_snapshot, memory_record, optional archive_entry, optional proposal_record. No approval_record or publication_record from the runner.
- **Proposal creation:** Twin inserts or updates proposal_record with initial state (e.g. pending_review). Caps enforced (habitat layout count, avatar count). No state transition to approved or applied by the Twin.
- **Human approval:** POST /api/artifacts/[id]/approve, POST /api/proposals/[id]/approve, etc. Enforce state machines and write approval_record, publication_record, change_record where applicable.
- **Public mutation:** Applying an approved proposal (e.g. habitat, avatar) or manual identity PATCH. Only after human approval; audit trail in change_record.

---

## Observability

### What must be logged

- Session start and finish; selected mode, drive, focus (project/thread/idea or archive).
- Preferred medium and actual artifact medium.
- Proposal created or refreshed (proposal_role, target_surface); or skip reason (ineligible, at cap).
- Non-fatal failures (trace update, deliberation insert, proposal insert) as warnings in the session payload.

### What must be persisted

- **creative_session:** mode, selected_drive, project_id, trace (JSONB), decision_summary (JSONB).
- **deliberation_trace:** observations_json (session_mode, selected_drive, selection_source, metabolism_mode, narrative_state), state_summary, tensions_json, hypotheses_json (selection_reason, action_kind, confidence_band), evidence_checked_json, rejected_alternatives_json, chosen_action, confidence, execution_mode, human_gate_reason, outcome_summary.
- **trajectory_review:** One row per session (diagnostic); narrative_state, action_kind, scores, issues/strengths. Does not alter governance or session results.
- **creative_state_snapshot:** After each artifact; feeds next session’s state.
- **artifact.artifact_role:** When inferable (layout_concept, image_concept).
- **proposal_record:** lane_type, proposal_role, target_surface, artifact_id, proposal_state.

### What must remain visible to operators

- Current creative state and backlog (return_candidates, proposal counts).
- Last N sessions with trace (mode, drive, project/thread/idea, artifact_id, proposal_id, tokens).
- Latest deliberation trace (observations, tensions, hypotheses, evidence, confidence).
- Continuity view: narrative_state, action_kind, tension_kinds, proposal created per session.
- **Truthfulness:** Operators must be able to tell what actually steered behavior. Today: only return mode changes focus; only preferred medium steers path and concept prompt; drive and narrative_state/action_kind are descriptive (post-hoc or stored-only). Confidence is defaulted unless the implementation derives it from critique/evaluation. The runtime UI should not imply that drive or non-return modes change generation logic until they do.

---

## Implementation status

| Layer | Status | Notes |
|-------|--------|-------|
| State and evidence load | Implemented | getLatestCreativeState, computePublicCurationBacklog. |
| Session mode | Partially implemented | computeSessionMode returns five modes; only "return" changes focus; others are prompt label. |
| Drive | Partially implemented | computeDriveWeights, selectDrive; stored and traced; not in generation prompt. |
| Focus selection | Implemented | Return path (archive) and project/thread path; return-intelligence and taste bias for archive. |
| Concept intent | Partially implemented | Inferred from medium only (layout_spec via concept, avatar_exploration via image). No explicit intent field. |
| Preferred medium | Implemented | derivePreferredMedium; steers path and concept prompt. |
| Artifact role | Implemented | inferArtifactRole(medium, isCron) → layout_concept | image_concept | null. |
| Proposal eligibility | Implemented | isProposalEligible for concept; image gated by cap and duplicate check. |
| Proposal role / target surface | Implemented | habitat_layout → staging_habitat; avatar_candidate → identity. naming_candidate, system_change reserved. |
| Execution lane | Implemented | Surface lane for habitat and avatar; caps in stop-limits. |
| Trace and explanation | Implemented | Session trace, decision_summary, deliberation_trace, trajectory_review. Confidence defaulted (0.7). |
| Concept intent (explicit field) | Reserved | Smallest next layer: optional concept_intent in prompt and/or artifact. |
| Drive in prompt | Reserved | Document as descriptive or add to generation prompt. |
| Confidence from critique | Reserved | Derive from evaluation/critique or stop showing as derived. |

---

## Canonical rules

1. **State and evidence** load once per session and feed mode, drive, and caps; they are not re-read during the pipeline.
2. **Session mode "return"** is the only mode that changes focus source (archive vs project/thread). Other modes are descriptive and passed as a label to the prompt.
3. **Drive** is part of the steering vocabulary; it must be stored and traced. It does not currently steer generation; either document that or add it to the prompt.
4. **Preferred medium** (explicit or derived) is the primary steering signal for generation path and concept prompt content.
5. **Concept intent** is semantically distinct from medium. Today intent is inferred from medium; the smallest next layer is one explicit intent used in the prompt and/or stored on the artifact.
6. **Artifact role** is inferred after generation; proposal creation branches on **medium**. Role is for trace, UI, and filtering.
7. **Proposal creation** is automatic only when eligible and under caps; the Twin never transitions proposal state or applies proposals. Approval and application are human-gated.
8. **Governance:** Generate and propose within lanes; never mutate public habitat or identity directly.
9. **Observability:** Persist session trace, decision_summary, deliberation_trace, and trajectory_review. Expose state, backlog, and continuity to operators. Do not imply steering where the code does not steer (e.g. drive, confidence).
10. **Implementation status** for each layer is documented above; align code and docs with "implemented" vs "partially implemented" vs "reserved" so the canon stays accurate.

---

## Future semantic upgrade: concept intent

Explicit **concept intent** may become a first-class decision layer in future iterations of the Twin decision system.

Today, concept intent is **inferred after generation** from the artifact medium, generation path, and resulting semantics. It is not selected before generation.

A future version of the pipeline may introduce an explicit intent step:

focus → concept intent → preferred medium → generation

This would allow the Twin to explicitly distinguish between different purposes for generated artifacts even when the medium is the same.

Examples include:

* reflective writing
* image prompts written as text
* habitat layout specifications
* naming exploration
* system change proposal drafts

Concept intent would describe **what the artifact is for**, while medium would continue to describe **the form the artifact takes**.

This section is intentionally forward-looking and does **not imply current implementation**.
