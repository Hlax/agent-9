# Twin_V1 Audit for AI Architect Builder Pivot

## 1. Executive Summary

**Twin_V1 is a governed creative system for identity-through-artifacts.** It is optimized for: one agent (the Twin) generating creative outputs (writing, image, concept) and proposing habitat/avatar/surface changes; one human (Harvey) reviewing by lane (artifact, surface, system) and controlling staging → public release. The product model is **creative identity exploration**, not software/product architecture design.

**Verdict: Only selective reuse recommended.** The repo has strong governance, proposal lanes, staging/promote flows, and immutable snapshot lineage—all conceptually adjacent to an AI Architect Builder. But the domain is deeply wired to **creative state, idea/thread lineage, artifact mediums (writing/image/concept), habitat-as-presentation, and a single-agent creative loop.** Repurposing the current build in place would require fighting the ontology, schema, and ~2.8k-line session-runner at every step. The best path is **Path B: fork and strip aggressively**, or **Path D: start fresh and port the strongest ideas** (governance, lanes, proposal FSM, snapshot semantics). Reverting to an earlier snapshot is unlikely to help: the complexity is structural (creative state, habitat, identity), not recent feature creep alone.

---

## 2. What the Current Repo Is Actually Built For

### Product model
- **Twin**: long-lived creative system that explores identity through generated artifacts (writing, image, audio, video, concept).
- **Harvey**: curator/reviewer/supervisor; nothing reaches public without staging + explicit approval.
- **Goal**: creative evolution and identity expression, not system-architecture design or technical planning.

### User flow
1. Harvey (or cron) starts a session.
2. Runtime: load creative state → select mode/drive → select focus (project/thread/idea or archive return) → build context → generate artifact (writing/concept/image) → critique → evaluate → persist artifact + state + proposals.
3. Proposals are created for: concept → habitat_layout (staging_habitat); image → avatar_candidate (identity); extension → medium lane.
4. Harvey reviews by lane (Surface / Medium / System); approves for staging, then “Push staging to public” or approve for publication.
5. Public Habitat shows only approved content.

### Data flow
- **Artifacts**: session → artifact (draft, pending_review) → approval_record / publication_record; lifecycle and approval are separate from publication.
- **Proposals**: proposal_record (lane_type: artifact | surface | system; plus “medium” in code); surface proposals merge into staging_habitat_content on approve_for_staging; promotion copies staging → public_habitat_content and creates habitat_snapshot.
- **State**: creative_state_snapshot (identity_stability, reflection_need, etc.) drives session mode and drive; evaluation_signal feeds state updates; idea/idea_thread recurrence drives focus and return.

### Agent workflow
- **Single agent** (Twin); one session pipeline: generate → critique → evaluate → persist → manageProposals (create/refresh proposal_record only; no self-approve).
- No multi-agent orchestration; no “design alternative architectures” or “compare system structures” as first-class flows.
- Proposals are **habitat layout, avatar candidate, extension**—not “architecture option A vs B” or “technical plan revision.”

### Governance / staging model
- **Strong fit for reuse:** approval lanes (artifact / surface / system), explicit FSM (proposal_state, artifact approval_state), runner forbidden from system lane, staging vs public separation, promote = human-only, immutable habitat_snapshot with lineage (parent_snapshot_id, identity_id).
- **Product-specific:** “Surface” means habitat/avatar/presentation; “staging” is literally staging_habitat_content (pages/slugs/blocks for a “habitat” UI), not “staging of architecture docs or schemas.”

### UI assumptions
- Studio: review by lane (Surface / Medium / System), artifact list, surface/habitat/avatar/medium/system sub-pages, staging composition card, “Push staging to public.”
- Habitat-staging app: renders staging_habitat_content (habitat pages).
- Public-site: public habitat (curated Twin face).
- Mental model: **content/habitat/identity curation**, not “compare architectures” or “edit technical plans.”

### Persistence model
- Postgres (Supabase): identity, project, idea_thread, idea, creative_session, artifact, critique_record, evaluation_signal, approval_record, publication_record, proposal_record, generation_run, creative_state_snapshot, staging_habitat_content, public_habitat_content, habitat_snapshot, habitat_promotion_record, archive_entry, change_record, memory_record, source_item, etc.
- **Heavy creative/identity ontology:** idea_thread, idea, creative_drive, session_mode, artifact_medium, creative_state_snapshot fields (identity_stability, avatar_alignment, expression_diversity, …).

### Artifact model
- **Artifact** = generated creative output (writing, image, concept, etc.); linked to session, idea, thread; has approval_state and publication_state.
- **Concept** artifacts can become surface proposals (habitat_layout → staging_habitat); concept is “structured creative thinking” (e.g. layout, component ideas), not “architecture decision record” or “system boundary spec.”

---

## 3. Reusable Systems

| Area | What it does now | Why reusable | Reuse as-is / light / heavy |
|------|------------------|--------------|-----------------------------|
| **Approval lanes** | Separates artifact vs surface vs system decisions; different review criteria and resolution paths. | Direct match: an Architect Builder needs “artifact” (e.g. ADR, diagram) vs “surface” (e.g. docs site) vs “system” (e.g. schema change). | **Light refactor:** rename “surface” to something like “presentation” or “docs” if needed; lane semantics stay. |
| **Proposal FSM** | proposal_state: pending_review → approved_for_staging → staged → approved_for_publication → published; plus needs_revision, archived, rejected, ignored. | Generic review/stage/promote lifecycle. | **Light refactor:** keep FSM; “staging” becomes “staged candidate” (could be staging branch of architecture repo or staged plan set). |
| **proposal-governance.ts** | Lane classification (surface/medium/system), actor authority (runner/human/reviewer), transition guards, canCreateProposal (runner blocked from system), evaluateGovernanceGate. | Clear authority and transition rules; runner cannot create system proposals. | **Light refactor:** reclassify proposal roles for “architecture_proposal”, “plan_revision”, “schema_change” etc.; keep structure. |
| **governance-rules.ts** | ARTIFACT_APPROVAL_TRANSITIONS, PROPOSAL_STATE_TRANSITIONS, isLegalProposalStateTransition, getNextLegalProposalActions. | Single source of truth for legal transitions; good for any review UI. | **As-is or light:** state names might stay; artifact transitions can map to “document/artifact” approval. |
| **Staging / promote semantics** | staging_habitat_content = mutable working state; promote = copy to public + record promotion; human-only. | “Staging = working branch; promote = human-approved release” is exactly what you want for staged architecture/plans. | **Heavy refactor:** replace habitat pages with “staged artifacts” (e.g. architecture docs, schemas); keep “staging vs public” and “promote only by human” semantics. |
| **habitat_snapshot + lineage** | Immutable snapshot (payload_json, parent_snapshot_id, identity_id, snapshot_kind); promotion creates new public snapshot. | Immutable snapshots with parent chain = good for decision/version lineage. | **Heavy refactor:** snapshot payload becomes “architecture snapshot” or “plan snapshot” (schemas, ADRs, boundaries); drop identity_id if single-tenant or repurpose as “workspace.” |
| **change_record** | change_type (identity_update, workflow_update, system_update, habitat_update, …), initiated_by (twin, harvey, system), approved, effective_at. | Audit trail for who changed what and when. | **Light refactor:** extend change_type for “architecture_update”, “schema_update”, “plan_update”; keep table and semantics. |
| **Review UI pattern** | Review hub by lane → sub-pages per lane; list proposals, show allowed actions from FSM. | Generic “review by category + legal actions” pattern. | **Light refactor:** same layout; swap copy from “habitat/avatar/extension” to “architecture/plan/schema”; reuse getNextLegalProposalActions. |
| **Session trace / deliberation** | creative_session.trace, deliberation_trace (observations, evidence, chosen_action, confidence). | Provenance and reasoning trail. | **Heavy refactor:** session becomes “builder session” or “design session”; trace shape can stay for “what was proposed and why.” |
| **@twin/core types** | Artifact, CreativeSession, approval_state, publication_state, proposal_record shape, etc. | Shared enums and types. | **Heavy refactor:** many types are creative-specific (idea_thread, creative_drive, artifact_medium); keep approval/publication/proposal shapes; new domain types for architecture. |
| **Packages: evaluation (creative state)** | updateCreativeState, computeSessionMode, computeDriveWeights, creative_state_snapshot. | Mode/drive/state machinery. | **Heavy refactor or drop:** creative state (identity_stability, reflection_need, …) is wrong abstraction for “architecture builder”; either replace with “design state” or rebuild. |
| **Packages: memory** | createArchiveEntry, lineage stubs. | Lineage/archive idea. | **Selective:** archive/return concept can map to “paused design direction”; implementation is thin; reuse idea, not necessarily code. |
| **Packages: agent** | runSessionPipeline (generate writing/concept/image), provenance stubs. | Generation pipeline pattern. | **Heavy refactor:** replace “creative generation” with “architecture/plan generation”; keep “session → generate → persist” structure if useful. |

---

## 4. Systems Likely to Be Removed or Rebuilt

| Area | Why remove or rebuild |
|------|------------------------|
| **Creative state model** | identity_stability, avatar_alignment, expression_diversity, reflection_need, creative_tension, etc. are for “creative metabolism,” not architecture design. Drives session_mode (continue/return/explore/reflect/rest) and drive weights. Replacing with a “design state” would be a parallel system; easier to design from scratch for “propose / compare / revise plans.” |
| **Idea / idea_thread / project (creative)** | Project and idea_thread are for “bounded creative work” and “lines of creative continuity.” Architect Builder needs “design space,” “alternatives,” “revisions”—different ontology. idea/thread recurrence and archive-return are creative-specific. |
| **artifact_medium (writing, image, audio, video, concept)** | Concept is “creative thinking output”; you need “architecture doc,” “schema,” “ADR,” “flow spec,” etc. Mediums and concept→habitat_layout flow are wrong primitives. |
| **Habitat payload (page, blocks, staging_habitat_content)** | Entire notion of “habitat” as presentation (pages, slugs, blocks) and staging_habitat_content as per-page content is for the Twin’s public face, not for storing/editing architecture artifacts. |
| **Avatar / identity (Twin identity)** | identity table and active_avatar, staging avatar, embodiment_direction, habitat_direction are about the Twin’s self-model and public persona. Architect Builder may have “workspace” or “project” but not “Twin identity.” |
| **Session runner (session-runner.ts)** | ~2.8k lines; tightly coupled to creative state, project/thread/idea selection, return-from-archive, derivePreferredMedium (writing/concept/image), manageProposals (habitat_layout, avatar_candidate, extension), style profile, trajectory feedback, synthesis pressure. The **orchestration pattern** (state machine, persist, trace) is reusable; the **content** is not. Either strip to a skeleton and rewire, or rebuild orchestrator around “design session” steps. |
| **return-intelligence, trajectory-taste-bias, synthesis-pressure** | All tuned for “creative return” and “avoid repetition” in creative exploration. Not directly useful for “compare architectures” or “revise technical plan.” |
| **Studio UI: surface/habitat/avatar/medium** | Pages and components that assume “habitat,” “avatar,” “concept,” “extension.” Replace with “architecture,” “plans,” “schemas,” “releases.” |
| **public-site / habitat-staging apps** | Built to render “habitat” (Twin’s public face) and staging preview. For Architect Builder, “public” might be “published architecture docs” or “released plan”; staging might be “staged changes to repo or doc set.” Logic differs. |
| **Critique + evaluation (creative)** | Self-critique and evaluation signals (alignment, emergence, fertility, pull, recurrence) are for creative judgment. You might want “coherence with existing architecture,” “feasibility,” “completeness”—different signals and flow. |

---

## 5. Structural Compatibility Verdict

**Classification: Only selective reuse recommended.**

- **Strong foundation** would mean: domain model and UX already centered on “propose system structures, compare alternatives, revise plans, trace decisions, human review/stage/promote.” Twin_V1 is centered on “generate creative artifacts, propose habitat/avatar, human review/stage/publish.”
- **Usable with major refactor** would mean: same mental model, different surface (e.g. same “artifact” but artifact = architecture doc). Here the mental model is “creative identity + habitat,” not “architecture + plans”; refactor would be pervasive (schema, runner, state, UI).
- **Only selective reuse:** Keep governance (lanes, FSM, proposal-governance, staging vs public, snapshot lineage, change_record), review UI pattern, and possibly approval/publication separation. Replace creative state, idea/thread, artifact medium/habitat, session-runner content, and habitat/avatar surfaces.
- **Rebuild from scratch:** Justified if you want a clean ontology (architecture, plan, schema, alternative, revision) and no creative-state or habitat legacy. You still port governance and snapshot semantics.

---

## 6. Best Pivot Path

**Recommended: Path B (Fork and strip aggressively) or Path D (Start fresh and port strongest ideas).**

- **Path A (Refactor in place):** Possible but high risk. Every touch (schema, runner, UI) conflicts with creative/identity/habitat assumptions; migration and regression surface are large.
- **Path B (Fork and strip):** Fork repo; delete or gut: creative state, idea/thread/archive-return, habitat payload and staging_habitat_content content model, avatar/identity persona, session-runner’s creative branches. Keep: DB schema skeleton (proposal_record, approval_record, publication_record, change_record, habitat_snapshot lineage concept), governance (proposal-governance, governance-rules), review hub by lane, staging/promote **semantics** (with new “staged” content type). Rebuild: “artifact” as architecture/plan doc, “session” as design session, “staging” as staged architecture set. High effort but bounded by existing tests and types.
- **Path C (Revert to earlier snapshot):** Not recommended. Early commits are still “creative Twin” + identity + artifacts; the useful parts (lanes, FSM, staging, snapshots) were added over time. Reverting loses governance and snapshot lineage; you’d still need to remove creative state and habitat.
- **Path D (Start fresh, port ideas):** New repo; implement “proposal_record + lanes + FSM,” “staging vs public + promote,” “immutable snapshot with parent,” “change_record,” and review-by-lane UI from scratch. Port proposal-governance.ts and governance-rules.ts (and adapt). No Twin creative state, no idea_thread, no habitat payload. Fastest path to a clean Architect Builder ontology; more initial build, less stripping.

**Choice between B and D:** Prefer **Path B** if you want to keep Supabase schema, migrations, and Studio shell and are willing to do a large strip and refactor. Prefer **Path D** if you want the cleanest domain model and minimal drag from creative/identity/habitat naming and tables.

---

## 7. Recommended First Target Architecture for the AI Architect Builder

- **Core entities:** Workspace (or Project) → Design sessions; Artifacts = architecture docs / ADRs / schemas / flow specs (replace “creative artifact”); Proposals = proposed changes (surface = presentation/docs, system = schema/runtime/architecture); no idea_thread/idea recurrence.
- **Governance:** Keep approval_lane (artifact / surface / system); add “medium” or “capability” lane if needed. Same FSM idea: pending_review → approved_for_staging → staged → approved_for_publication → published; human-only promote.
- **Staging:** “Staging” = current candidate set of architecture/plan artifacts (or a branch/diff); not “habitat pages.” Promote = human approves → copy staged set to “published” and create immutable snapshot with lineage.
- **Snapshots:** Immutable snapshot per promotion; payload = architecture/plan state (e.g. doc set, schema versions); parent_snapshot_id for lineage; no identity_id unless multi-tenant.
- **Sessions:** “Design session” or “builder session”: load context → propose/revise structure or plan → create/update proposals → persist artifacts and trace; no creative state or drive/mode in the Twin sense.
- **UI:** Review hub by lane; list proposals (architecture/plan/schema); show diff vs current; approve/stage/promote; compare alternatives (new feature).
- **Multi-agent (later):** Agent types can map to different proposal roles or lanes; same governance (human gates, staging, promote).

---

## 8. First 7 Implementation Moves

1. **Decide Path B vs D** — If B: fork, create a “architect-builder” branch and a delete/strip list (creative state, idea/thread, habitat payload, avatar, return-intelligence, trajectory, synthesis-pressure). If D: new repo, copy governance and FSM modules only.
2. **Define new domain model** — Artifact types (e.g. architecture_doc, adr, schema, flow_spec); proposal roles (e.g. architecture_proposal, plan_revision, schema_change); “staging” content model (what is “staged” and how it’s stored).
3. **Preserve and adapt governance** — Keep proposal-governance.ts and governance-rules.ts; add/remap proposal_role and lane classification for Architect Builder; keep runner forbidden from system lane.
4. **Schema: minimal viable** — Either (B) add new tables (e.g. architecture_artifact, plan_revision) and leave old tables unused/deprecated, or (D) new schema: proposal_record, approval_record, snapshot table, change_record, artifact-like table with new type enum.
5. **Staging and promote** — Implement “staged” set of architecture/plan artifacts and one “promote” action that creates immutable snapshot and updates “published”; reuse promote semantics (human-only, record promotion).
6. **Review UI** — Same lane-based review hub; replace Surface/Medium/System copy and list content with “architecture / plan / schema” proposals and allowed actions from FSM.
7. **Builder session (minimal)** — Replace or stub session-runner: one “design session” that can create/update proposals and artifacts (e.g. “propose structure,” “revise plan”); no creative state, no idea/thread; persist trace/deliberation shape for provenance.

---

## 9. Risk Assessment

| Risk | Mitigation |
|------|-------------|
| **Scope creep (refactor in place)** | Commit to Path B or D; do not try to “gradually” morph Twin into Architect Builder in the same branch. |
| **Governance drift** | Keep proposal-governance and governance-rules as the single source of truth; document any new states or roles. |
| **Schema migration** | Path B: additive tables or renames; deprecate creative tables in stages. Path D: clean schema from day one. |
| **Session-runner dependency** | Path B: extract “orchestration shell” (load → steps → persist trace) and replace steps with builder steps. Path D: new orchestrator. |
| **UI confusion** | Rename all “habitat,” “avatar,” “concept,” “Twin,” “Harvey” to Architect Builder terms in the forked/fresh UI. |
| **Loss of traceability** | Keep deliberation/trace pattern; ensure “proposal + snapshot + change_record” still give full lineage. |

---

## 10. Final Recommendation

- **Use the current repo as the main codebase only if** you choose Path B and accept a long strip-and-refactor.
- **Do not** refactor in place (Path A) without a clear “strip list” and new domain model; otherwise you will carry creative state and habitat forever.
- **Do not** revert to an earlier snapshot (Path C) expecting a “simpler base”; the base was already creative Twin.
- **Port these first:** proposal-governance.ts, governance-rules.ts, proposal FSM and lane semantics, staging vs public and promote semantics, immutable snapshot with parent lineage, change_record, review-by-lane UI pattern.
- **Drop or replace:** creative state, idea/thread/archive-return, artifact_medium and concept→habitat flow, staging_habitat_content and habitat payload, avatar/identity persona, session-runner’s creative logic, return-intelligence, trajectory-taste-bias, synthesis-pressure.

---

## Blunt Conclusion

- **Keep and refactor:** Proposal lanes, proposal FSM, proposal-governance.ts, governance-rules.ts, staging vs public semantics, human-only promote, immutable snapshot lineage concept, change_record, review hub by lane (structure and FSM-driven actions).
- **Keep selectively:** approval_record/publication_record pattern; @twin/core approval/publication/proposal types (rename/expand); session trace/deliberation pattern; packages/memory lineage idea (not necessarily code).
- **Drop entirely:** Creative state model (creative_state_snapshot, evaluation-driven mode/drive); idea/idea_thread/project (creative); artifact_medium (writing/image/concept) and concept→habitat_layout; staging_habitat_content and habitat payload; avatar/identity (Twin persona); return-intelligence, trajectory-taste-bias, synthesis-pressure; session-runner’s creative branches (mode/drive/focus/derivePreferredMedium/manageProposals content); Studio/habitat-staging/public-site copy and flows that assume “Twin” and “habitat.”
- **Best path:** **Path B (fork and strip aggressively)** if you want to keep Supabase and Studio shell; **Path D (start fresh, port strongest ideas)** if you want the cleanest Architect Builder ontology and minimal legacy.
- **Confidence level:** **High** that the current repo is not a “strong foundation” or “usable with major refactor” for an AI Architect Builder without a decisive strip/port; **high** that governance, lanes, FSM, staging/promote, and snapshot lineage are the right ideas to preserve.
