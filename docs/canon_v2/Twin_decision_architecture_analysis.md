# Twin decision architecture analysis

Targeted architectural analysis of how the Twin moves from state/memory/backlog/context through session mode, drive, focus, medium, generation, artifact role, proposal eligibility, proposal role/target surface, and runtime trace. Grounded in canon (01_foundation, 02_runtime) and code (session-runner, evaluation, agent, runtime-state-api, ontology-helpers, proposal-eligibility).

---

## 1. Current pipeline as implemented

### Step 1: State and backlog load

- **Input:** None (first I/O).
- **Output:** `previousState` (creative state fields 0–1), `liveBacklog` (proposal backlog count).
- **Files:** `session-runner.ts`: `loadCreativeStateAndBacklog()`.
- **Functions:** `getLatestCreativeState(state.supabase)` → latest `creative_state_snapshot` or default; `computePublicCurationBacklog(state.supabase)` → count of active proposals.
- **Persisted:** Nothing at this step.
- **Behavioral:** Yes. These values feed mode, drive, and later caps.

**Ref:** `session-runner.ts` 321–325.

---

### Step 2: Session mode

- **Input:** `sessionState = { ...previousState, public_curation_backlog: liveBacklog }`.
- **Output:** `sessionMode` ∈ { reflect, return, continue, explore, rest }.
- **Files:** `session-runner.ts` → `selectModeAndDrive()`; `packages/evaluation/src/creative-state.ts` → `computeSessionMode()`.
- **Logic:** Thresholds on state: reflection_need ≥ 0.6 → reflect; unfinished_projects ≥ 0.6 and idea_recurrence ≥ 0.4 → return; unfinished_projects ≥ 0.5 → continue; recent_exploration_rate < 0.35 → explore; creative_tension < 0.3 → rest; else explore.
- **Persisted:** Stored on `creative_session.mode` and in `deliberation_trace.observations_json.session_mode` (later).
- **Behavioral:** **Only for "return".** In `selectFocus()`, only `sessionMode === "return"` triggers the archive path. All other modes (reflect, continue, explore, rest) take the same path: project/thread/idea selection. Mode is also passed as a literal string into the generation user prompt (`Mode: ${input.mode}.`) but does not branch generation logic.

**Ref:** `creative-state.ts` 186–194; `session-runner.ts` 324–327, 344–348 (selectFocus branch).

---

### Step 3: Drive selection

- **Input:** Same `sessionState` as step 2.
- **Output:** `selectedDrive` (one of CreativeDrive: coherence, expression, emergence, expansion, return, reflection, curation, habitat).
- **Files:** `session-runner.ts` → `selectModeAndDrive()`; `packages/evaluation/src/creative-state.ts` → `computeDriveWeights()`, `selectDrive()`.
- **Logic:** `computeDriveWeights(state)` builds weights from base constants plus state (e.g. identity_stability, avatar_alignment, creative_tension, curiosity_level, reflection_need, public_curation_backlog, idea_recurrence). Weights normalized to sum to 1. `selectDrive(weights)` picks one drive by probabilistic choice (Math.random() cumsum over weights).
- **Persisted:** Stored on `creative_session.selected_drive`, in session `trace`, and in `deliberation_trace.observations_json.selected_drive`.
- **Behavioral:** **No.** Drive is not passed to `generateWriting()` or `generateImage()`. The agent’s `SessionContext` has `selectedDrive` and it is stored on the session object, but the writing and image generation prompts do not include drive. So drive is **descriptive only** (traces, UI).

**Ref:** `creative-state.ts` 158–205; `session-pipeline.ts` 64–65, 80–99 (no drive in generateWriting/generateImage input); `generate-writing.ts` 72 (only mode in prompt).

---

### Step 4: Focus selection (project / thread / idea or archive)

- **Input:** `sessionMode`, `supabase`, archive/project data.
- **Output:** `selectedProjectId`, `selectedThreadId`, `selectedIdeaId`, `selectionSource` (archive | project_thread | null), `archiveCandidateAvailable`, `decisionSummary` (project/thread/idea reasons, rejected_alternatives).
- **Files:** `session-runner.ts` → `selectFocus()`; `return-intelligence.ts` (return path); `project-thread-selection.ts` (project path); `trajectory-taste-bias.ts` (return path).
- **Logic:** If `sessionMode === "return"` and archive_entry rows exist: score candidates (recurrence, pull, critique, age, tension), apply taste bias by action kind, pick one; set focus from that entry. Else: `selectProjectAndThread(supabase)` (weighted by thread recurrence and creative_pull) and optionally an idea.
- **Persisted:** Focus IDs are written into `creative_session` and artifact rows; reasons go into `decisionSummary` and then `creative_session.decision_summary` and deliberation trace.
- **Behavioral:** Yes. Return vs project_thread determines which context (archive vs active project/thread/idea) is used; focus IDs feed `buildContexts()` and thus workingContext/sourceContext for generation.

**Ref:** `session-runner.ts` 331–528; `project-thread-selection.ts`; `return-intelligence.ts`.

---

### Step 5: Preferred medium

- **Input:** `previousState`, explicit `preferMedium` from options, `isCron`.
- **Output:** `derivedPreferMedium` ∈ { writing, concept, image } | null.
- **Files:** `session-runner.ts` → `derivePreferredMedium()` (in `runGeneration()`), `runGeneration()`.
- **Logic:** Explicit `preferMedium` wins. Else: reflection_need > 0.65 or unfinished_projects > 0.55 → concept; (avatar_alignment < 0.4 and public_curation_backlog > 0.4) or (expression_diversity < 0.35 and creative_tension > 0.5) → image; cron and Math.random() < 0.12 → image; else null (writing/concept path).
- **Persisted:** Not stored as a column; reflected in artifact `medium` and in trace.
- **Behavioral:** **Yes.** `preferMedium` (or derived) is passed to `runSessionPipeline()` and determines: (1) image vs writing path (`preferImage` → `generateImage` vs `generateWriting`); (2) when "concept", `generate-writing.ts` adds `CONCEPT_HABITAT_GUIDANCE` to the user prompt and may use a different model. So medium choice steers both routing and prompt content.

**Ref:** `session-runner.ts` 204–240, 554–562; `session-pipeline.ts` 80–101; `generate-writing.ts` 72–76, 107–108.

---

### Step 6: Generation (artifact creation)

- **Input:** mode, selectedDrive (stored but not in prompt), project/thread/idea IDs, promptContext, workingContext, sourceContext, preferMedium.
- **Output:** `pipelineResult` (session + artifacts), `primaryArtifact`, `tokensUsed`, `derivedPreferMedium`.
- **Files:** `session-runner.ts` → `runGeneration()`; `packages/agent/src/session-pipeline.ts` → `runSessionPipeline()`; `generate-writing.ts` or `generate-image.ts`.
- **Logic:** If preferMedium === "image" → `generateImage(...)`; else `generateWriting({ mode, preferMedium, ... })`. Writing prompt includes "Mode: ${mode}." and, when preferMedium === "concept", CONCEPT_HABITAT_GUIDANCE. No drive in prompt. Session object gets mode and selected_drive for persistence only.
- **Persisted:** Session row inserted later; artifact row inserted in `persistCoreOutputs`; generation_run in same stage.
- **Behavioral:** Yes. Mode is a short literal in the prompt; preferMedium steers path and concept prompt; focus drives context (workingContext/sourceContext).

**Ref:** `session-pipeline.ts` 52–136; `generate-writing.ts` 69–86, 107–108.

---

### Step 7: Artifact role inference

- **Input:** `artifact.medium`, `isCron`.
- **Output:** `artifact_role` ∈ { layout_concept, image_concept } | null.
- **Files:** `session-runner.ts` → `inferArtifactRole()`, used in `persistCoreOutputs()` when building artifact row.
- **Logic:** concept + cron → layout_concept; image + cron → image_concept; else null.
- **Persisted:** `artifact.artifact_role` column.
- **Behavioral:** **No.** Role is set after generation. It is used for trace, eligibility APIs, and UI; `manageProposals` branches on `artifact.medium`, not on `artifact_role`. So role is descriptive and for filtering, not for changing generation or proposal logic.

**Ref:** `session-runner.ts` 185–197, 714–735.

---

### Step 8: Proposal eligibility (concept → habitat)

- **Input:** For concept artifacts only: medium, alignment_score, fertility_score, pull_score, critique_outcome.
- **Output:** eligible: boolean, reason: string.
- **Files:** `apps/studio/lib/proposal-eligibility.ts` → `isProposalEligible()`; `session-runner.ts` → `manageProposals()`.
- **Logic:** medium must be "concept"; critique_outcome ∈ { continue, branch, shift_medium }; alignment ≥ 0.6, fertility ≥ 0.7, pull ≥ 0.6.
- **Persisted:** No direct write; eligibility gates whether a proposal_record is created.
- **Behavioral:** Yes. When eligible, a habitat_layout proposal can be created or refreshed (subject to caps). Image path does not use this function; avatar proposals are created when medium === "image" and no existing proposal for that artifact, subject to avatar cap.

**Ref:** `proposal-eligibility.ts`; `session-runner.ts` 1011–1150 (concept), 1154–1217 (image).

---

### Step 9: Proposal role and target surface

- **Input:** Artifact medium, caps, existing proposals.
- **Output:** proposal_record rows with lane_type, target_type, proposal_role, target_surface.
- **Files:** `session-runner.ts` → `manageProposals()`.
- **Logic:** Concept + eligible + under habitat cap → lane_type "surface", target_type "concept", proposal_role "habitat_layout", target_surface "staging_habitat"; or refresh newest and archive older. Image + no existing avatar proposal for this artifact + under avatar cap → lane_type "surface", target_type "avatar_candidate", proposal_role (implicit avatar_candidate), target_surface "identity".
- **Persisted:** proposal_record inserts/updates; trace fields traceProposalId, traceProposalType, decisionSummary.next_action.
- **Behavioral:** Yes. Determines whether a proposal is created and with which role/surface; caps enforce limits (getMaxPendingHabitatLayoutProposals, getMaxPendingAvatarProposals).

**Ref:** `session-runner.ts` 1002–1229; `stop-limits.ts` (caps).

---

### Step 10: Runtime trace and explanation

- **Input:** Full SessionExecutionState after persistence (mode, drive, focus, artifact, proposal flags, decisionSummary, metabolismMode from runtime_config).
- **Output:** creative_session.trace, creative_session.decision_summary; deliberation_trace row; trajectory_review row.
- **Files:** `session-runner.ts` → `writeTraceAndDeliberation()`, `persistTrajectoryReview()`; `deliberation-trace.ts` → `writeDeliberationTrace()`; `ontology-helpers.ts` (classifyNarrativeState, classifyActionKind, deriveTensionKinds, deriveEvidenceKinds, classifyConfidenceBand).
- **Logic:** Trace JSON: mode (metabolismMode), drive, project/thread/idea ids and names, artifact_id, proposal_id, proposal_type, tokens_used, timestamps. Deliberation: observations_json (session_mode, selected_drive, selection_source, metabolism_mode, narrative_state), state_summary string, tensions_json, hypotheses_json (selection_reason, action_kind, confidence_band), evidence_checked_json, chosen_action, confidence. Narrative state and action_kind are classified from ontology state (e.g. return vs expansion vs reflection vs curation_pressure vs stalled; resurface_archive vs generate_habitat_candidate vs generate_avatar_candidate vs continue_thread).
- **Persisted:** creative_session updated; deliberation_trace insert; trajectory_review insert.
- **Behavioral:** No. Purely descriptive/observability; no feedback into next session’s decisions except insofar as creative_state_snapshot and backlog already capture state.

**Ref:** `session-runner.ts` 1232–1368, 1376–1454; `deliberation-trace.ts`; `ontology-helpers.ts`.

---

## 2. Steering vs descriptive layers

| Component | Verdict | Evidence |
|-----------|--------|----------|
| **Session mode** | **Partially steering** | Only "return" changes behavior (archive path in selectFocus). "reflect", "continue", "explore", "rest" all use project_thread path. Mode string is also injected into the generation user prompt but does not change branching or prompt structure. |
| **Drive** | **Mostly descriptive** | Computed and stored; displayed in trace and ontology UI. Not passed to generateWriting or generateImage. No branching on drive in agent. |
| **Preferred medium** | **Meaningfully steering** | Chooses image vs writing path; when "concept" adds habitat guidance to prompt and can switch model. Derived from state + cron random. |
| **artifact_role** | **Mostly descriptive** | Inferred from medium + isCron after generation. Stored for UI and eligibility APIs. manageProposals branches on medium, not artifact_role. |
| **proposal_role** | **Meaningfully steering** | Set when creating proposals (habitat_layout vs avatar_candidate). Determines lane, target_surface, and downstream approval/apply routes. |
| **Runtime summary (trace, deliberation, trajectory_review)** | **Descriptive** | All written after the fact from state. Used for UI and operator inspection; no code reads them to change the next run’s mode, drive, or focus. |

**Code refs:**  
- Mode: `creative-state.ts` 186–194; `session-runner.ts` 344–348, 487–491; `generate-writing.ts` 72.  
- Drive: `session-pipeline.ts` 64–65, 80–99; `generate-writing.ts` (no selectedDrive in input).  
- Medium: `session-runner.ts` 204–240, 554–562; `generate-writing.ts` 73–76, 107–108.  
- artifact_role: `session-runner.ts` 185–197, 714–735; manageProposals uses `artifact.medium`.  
- proposal_role: `session-runner.ts` 1109–1125, 1183–1206.

#### Drive and medium steering audit

- **computeDriveWeights:** Inputs = CreativeStateFields (+ liveBacklog as public_curation_backlog). Output = weights per drive (normalized). Downstream: only selectDrive(); no prompt or routing uses drive. **Conclusion:** Not steering; label only.
- **selectDrive:** Probabilistic pick from weights. Stored and traced; not passed to generation. **Conclusion:** Descriptive only.
- **derivePreferredMedium:** Inputs = state, explicit preferMedium, isCron. Steers image vs writing path and concept vs writing prompt (CONCEPT_HABITAT_GUIDANCE). **Conclusion:** Meaningfully steering.

**Ref:** `creative-state.ts` 158–205; `session-runner.ts` 204–240, 554–562; `generate-writing.ts` 72–76, 107–108.

---

## 3. Concept–proposal gap analysis (concept intent)

The system does **not** semantically distinguish these intents in generation or routing:

- Reflective writing  
- Image prompts written as text  
- Habitat or staging layout specs  
- System change proposal drafts  
- Naming exploration  
- Thread continuation writing  
- Avatar exploration (as a distinct “intent”; image path is separate)

**What exists today:**

- **Medium-level routing:** writing vs concept vs image. Only "concept" adds habitat guidance to the prompt; "image" uses a separate image pipeline. So the only semantic distinction in the pipeline is: **generic writing**, **concept (habitat-oriented)**, **image**.
- **Text artifacts:** All non-image text goes through `generateWriting()`. The prompt contains "Mode: ${mode}." and optional CONCEPT_HABITAT_GUIDANCE when preferMedium === "concept". There is no field or prompt branch for "reflection", "naming", "thread continuation", or "system proposal". So **text is not labeled or steered by concept intent**; only by mode (as a short label) and concept vs non-concept.
- **Proposal creation:** Proposals are created from **medium** (concept → habitat_layout, image → avatar_candidate), not from an explicit "intent" or "artifact_role" semantic. artifact_role is set post hoc (layout_concept / image_concept) for display and filtering.
- **Ontology (light_ontology.md):** Defines artifact_role and proposal_role values (e.g. reflection, writing_fragment, naming_candidate, system_change_proposal) as reserved or future. They are **not** implemented in the runner or agent.

**Where the gap is:**

- No **intent** or **concept_type** (e.g. reflective_writing, habitat_spec, naming_exploration) is computed or passed into generation. So the model cannot be steered differently for naming vs reflection vs layout.
- Concept vs writing is determined by **preferMedium** (derived or explicit), not by content or intent. So "reflective writing" and "habitat spec" are only distinguished if one is explicitly requested as concept and the other as writing.
- Proposal roles beyond habitat_layout and avatar_candidate (e.g. naming_candidate, system_change_proposal) are **reserved** in docs; no code path creates or routes them.

**Conclusion:** Concept intent is **not** differentiated. Only medium (writing / concept / image) and the single concept-habitat prompt addition exist. The conceptual bridge for reflective writing, naming, thread continuation, system proposals, and layout vs non-layout text is **missing** in the current pipeline.

#### Proposal system semantics (summary)

- **Eligibility:** Concept → habitat_layout via `isProposalEligible()` (medium, critique_outcome, alignment ≥ 0.6, fertility ≥ 0.7, pull ≥ 0.6). Image → avatar_candidate: no eligibility check; created when medium === "image" and under cap.
- **Artifact role:** Set from medium + isCron; proposal creation branches on medium, not artifact_role.
- **Mapping:** Concept → proposal_role "habitat_layout", target_surface "staging_habitat"; image → "avatar_candidate", "identity".
- **Caps:** Habitat layout default 2 (active); avatar default 3 (pending_review). At cap: habitat refreshes newest and archives older; avatar skips.
- **Governance:** Runner only creates/updates; approval and application are human-gated via API.
- **Implemented:** habitat_layout, avatar_candidate. **Reserved:** naming_candidate, system_change_proposal (canon/UI only).

**Ref:** `session-runner.ts` 1002–1229; `proposal-eligibility.ts`; `stop-limits.ts`.

---

## 4. Runtime truthfulness gaps

Where runtime/debug UI can imply more than the code guarantees:

| UI / trace element | What’s implied | What code actually does |
|--------------------|----------------|--------------------------|
| **Session mode** (explore, return, reflect, continue, rest) | That each mode changes behavior. | Only "return" changes focus (archive path). Other modes share project_thread path; mode is a string in the prompt only. |
| **Selected drive** | That drive steers creative direction. | Drive is not in the generation prompt; it is stored and displayed only. |
| **Narrative state / action kind** | Rich ontology (return, expansion, reflection, curation_pressure, stalled; resurface_archive, generate_habitat_candidate, etc.). | Classified **after** the run from session state and flags. They describe what happened, they don’t cause it. |
| **Confidence / confidence_band** | That confidence reflects model or critique. | decisionSummary.confidence is initialized to 0.7 and never updated from pipeline or critique. confidence_band is derived from that fixed value. Effectively **defaulted**. |
| **Thread/project continuity** | Durable linkage across sessions. | Focus (project/thread/idea) is chosen per run; recurrence writeback updates idea/thread recurrence_score. Continuity is re-established each run by selection, not by a persistent “current thread” that survives across sessions. |
| **Evidence kinds / tension kinds** | That the Twin “checked” these. | They are derived from the same state used for decisions (e.g. archiveCandidateAvailable, liveBacklog). They are descriptive labels, not proof of separate evidence lookup. |
| **Return Intelligence / taste bias** | Sophisticated return selection. | Implemented and used only when sessionMode === "return" and archive entries exist. So it is real for that path, but “return” is the only mode that changes focus source. |

**Summary:** Real steering: focus (return vs project_thread), preferMedium (path + concept prompt), proposal creation and caps. Largely descriptive or defaulted: mode (except return), drive, narrative_state, action_kind, confidence, and “continuity” as implied by UI (no durable current-thread state).

---

## 5. Minimal semantic additions recommended

- **Mode → behavior:** Either (a) give "reflect" / "continue" / "rest" distinct behavior (e.g. reflect: different prompt or focus bias), or (b) document in canon and runtime UI that only "return" changes focus source and other modes are descriptive/prompt labels. Prefer (b) if avoiding scope creep.
- **Drive → prompt:** If drive is to steer content, add selectedDrive (or a short label) to the generation user prompt in `generate-writing.ts` and, if applicable, image prompt. Otherwise document drive as descriptive only.
- **Confidence:** Either (a) derive confidence from critique/evaluation (e.g. single scalar from scores or outcome) and set decisionSummary.confidence in the runner, or (b) stop showing confidence_band in UI as if it were derived. Prefer (a) for truthfulness.
- **Concept intent:** Smallest addition: one optional field (e.g. concept_intent or artifact_intent) with values like "habitat_spec" | "reflection" | "naming" | "thread_continuation" | "general", set from mode + optional future classifier, and passed into the writing prompt so the model can adjust tone/content. No large ontology; single enum or short list.
- **Proposal roles:** Keep naming_candidate and system_change_proposal as reserved until there are explicit creation paths and caps; document in canon as “reserved”.

---

## 6. Concrete implementation targets

| Change | Files / functions |
|--------|--------------------|
| Document mode vs behavior | `docs/canon_v2/02_runtime/session_orchestrator.md`, `creative_metabolism.md` (state that only return changes focus; other modes are prompt label). |
| Document drive as descriptive | `docs/canon_v2/01_foundation/light_ontology.md`, `creative_metabolism.md` (drive is steering vocabulary but not yet wired to generation). |
| Add drive to prompt (if desired) | `packages/agent/src/generate-writing.ts` (`buildUserPrompt`: append drive when selectedDrive present); `session-pipeline.ts` already passes context.selectedDrive. |
| Confidence from critique or hide | `apps/studio/lib/session-runner.ts` (set decisionSummary.confidence from evaluation or critique in runCritiqueAndEvaluation or after persistCoreOutputs); or `apps/studio/app/runtime/ontology-panel.tsx` / continuity UI (downplay or remove confidence_band). |
| Concept intent (minimal) | `packages/agent/src/generate-writing.ts` (accept optional intent; add one line to user prompt); `session-runner.ts` (derive intent from mode or constant and pass to pipeline); `packages/agent/src/session-pipeline.ts` (pass intent into GenerateWritingInput if added). |
| Proposal roles reserved | `docs/canon_v2/01_foundation/light_ontology.md` (explicit “implemented” vs “reserved” for proposal_role and target_surface). |

No code patches or large rewrites; only the above targeted edits and doc clarifications to align architecture with behavior and UI.
