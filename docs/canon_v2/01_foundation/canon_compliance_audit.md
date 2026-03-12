# Canon Compliance Audit

**Canon source:** `docs/canon_v2/01_foundation/twin_decision_system.md`
**Runtime source:** `apps/studio/lib/session-runner.ts`
**Supporting runtime:** `apps/studio/lib/proposal-eligibility.ts`, `apps/studio/lib/deliberation-trace.ts`, `apps/studio/lib/return-intelligence.ts`, `apps/studio/lib/trajectory-taste-bias.ts`, `apps/studio/lib/ontology-helpers.ts`
**Audit date:** 2026-03-12

---

## Pipeline verification

### 1. State and evidence

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Loaded once per session | Yes | `loadCreativeStateAndBacklog()` called once before mode/drive |
| Source | Latest creative_state_snapshot or default | `getLatestCreativeState(supabase)` → default via `defaultCreativeState()` |
| Live backlog | `computePublicCurationBacklog` | `computePublicCurationBacklog(supabase)` ✓ |
| Feeds mode, drive, and caps | Yes | `sessionState = { ...previousState, public_curation_backlog: liveBacklog }` passed to `computeSessionMode`, `computeDriveWeights` ✓ |

**Status: Fully implemented.**

---

### 2. Session mode

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Computed from | Creative state thresholds | `computeSessionMode(sessionState)` from `@twin/evaluation` ✓ |
| Possible values | explore, return, reflect, continue, rest | Same five values ✓ |
| Only "return" changes behavior | Yes — other modes are prompt labels | Return triggers archive path in `selectFocus()`; all modes passed to `runSessionPipeline({ mode })` as prompt label ✓ |
| Persisted | `creative_session.mode` | Set from `result.session.mode` (pipeline echoes the input mode) ✓ |

**Status: Partially implemented** — matches canon. Only `return` changes focus source; other modes are descriptive label. Canon-acknowledged.

---

### 3. Drive

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Selection mechanism | Probabilistically from weights derived from creative state | `computeDriveWeights(sessionState)` → `selectDrive(driveWeights)` ✓ |
| Stored | Yes | Passed to `runSessionPipeline({ selectedDrive })` which sets `result.session.selected_drive`; persisted via session row ✓ |
| Traced | Yes | `creative_session.trace.drive` and `deliberation_trace.observations_json.selected_drive` ✓ |
| In generation prompt | **No** per canon | `selectedDrive` is passed to `runSessionPipeline` as a parameter, but whether the agent pipeline injects it into the LLM prompt is determined by `@twin/agent`. Canon says "not in generation prompts today." See [Drive behavior](#drive-behavior). |

**Status: Partially implemented** — stored and traced. Prompt injection status depends on `@twin/agent` internals (see additional checks below).

---

### 4. Focus selection

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Return mode: archive path | Scored and taste-biased | `scoreReturnCandidates()` + `applyTasteBias()` + `getTasteBiasMap()` ✓ |
| Return mode: top-50 archive entries | Yes | `.limit(50)` query on `archive_entry` ✓ |
| Default mode: project/thread | `selectProjectAndThread()` weighted by recurrence and creative_pull | `selectProjectAndThread(supabase)` ✓ |
| Selection source tracked | `archive` or `project_thread` | `selectionSource` field set in both branches ✓ |
| Persisted | decision_summary, deliberation | `decisionSummary.project_reason`, `thread_reason`, `idea_reason`, `rejected_alternatives` updated ✓ |

**Status: Fully implemented.**

---

### 5. Preferred medium

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Explicit caller wins | Yes | `if (explicit) return explicit` ✓ |
| reflection_need > 0.65 → concept | Yes | `if (reflection_need > 0.65 ...)  return "concept"` ✓ |
| unfinished_projects > 0.55 → concept | Yes | `... || unfinished_projects > 0.55` ✓ |
| avatar_alignment < 0.4 & backlog > 0.4 → image | Yes | ✓ |
| expression_diversity < 0.35 & tension > 0.5 → image | Yes | ✓ |
| Cron 12% image | Yes | `if (isCron && Math.random() < 0.12) return "image"` ✓ |
| Default: null (writing path) | Yes | `return null` ✓ |
| Steers generation path | Yes | Passed as `preferMedium` to `runSessionPipeline` ✓ |

**Status: Fully implemented.**

---

### 6. Generation

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| One artifact produced | Yes | `pipelineResult.artifacts.slice(0, maxArtifacts)[0]` (max enforced) ✓ |
| In-memory only | Yes | `runGeneration()` returns pipeline result; DB insert is deferred to `persistCoreOutputs()` ✓ |
| Image uploaded to storage | Yes | `uploadImageToStorage()` called if `medium === "image"` and content_uri present ✓ |
| Token limit enforced | Yes | `isOverTokenLimit(tokensUsed)` throws `SessionRunError(400)` ✓ |

**Status: Fully implemented.**

---

### 7. Concept intent (inferred)

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Inferred post-generation | Yes — not chosen before generation | No pre-generation intent step exists ✓ |
| Inferred from | medium + path + result semantics | Inferred implicitly: concept medium → layout_spec path (CONCEPT_HABITAT_GUIDANCE added to prompt); image → avatar_exploration path ✓ |
| Explicit concept_intent field | **Reserved** | No `concept_intent` field on artifact or session ✓ (matches canon "reserved") |
| Categories: thread_continuation | Partially implemented per canon | No explicit label; thread/idea context provided to generation ✓ |
| Categories: layout_spec | Implemented | concept medium triggers habitat guidance in prompt ✓ |
| Categories: avatar_exploration | Implemented | image medium triggers avatar proposal path ✓ |

**Status: Partially implemented** — matches canon description. Intent is inferred only. No explicit field. Canon-acknowledged as the "smallest next semantic layer."

---

### 8. Artifact role

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Inferred after generation | Yes | `inferArtifactRole(medium, isCron)` called in `persistCoreOutputs()` ✓ |
| concept + cron → layout_concept | Yes | ✓ |
| image + cron → image_concept | Yes | ✓ |
| Non-cron → null | Yes | `return null` for non-cron sessions ✓ |
| Proposal creation branches on medium | Yes | `if (artifact.medium === "concept")` / `if (artifact.medium === "image")` — not on `artifact_role` ✓ |
| Stored on artifact | Yes | `artifact_role: artifactRole` in insert row ✓ |

**Status: Fully implemented.** Non-cron sessions returning `null` is intentional and canon-acknowledged (role is derived from medium + cron context).

---

### 9. Proposal eligibility

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Concept: medium = concept | Yes | `isProposalEligible({ medium })` first checks `medium !== "concept"` ✓ |
| Concept: critique_outcome ∈ {continue, branch, shift_medium} | Yes | `ELIGIBLE_CRITIQUE_OUTCOMES = ["continue", "branch", "shift_medium"]` ✓ |
| Concept: alignment ≥ 0.6 | Yes | `ALIGNMENT_MIN = 0.6` ✓ |
| Concept: fertility ≥ 0.7 | Yes | `FERTILITY_MIN = 0.7` ✓ |
| Concept: pull ≥ 0.6 | Yes | `PULL_MIN = 0.6` ✓ |
| Image: no eligibility function | Yes | No `isProposalEligible` call for image path ✓ |
| Image: gated by cap and no duplicate | Yes | Cap checked via `getMaxPendingAvatarProposals()`; duplicate via `existingAvatar` query ✓ |

**Status: Fully implemented.**

---

### 10. Proposal role

| Attribute | Canon | Implementation (pre-fix) | Implementation (post-fix) |
|-----------|-------|--------------------------|---------------------------|
| concept → habitat_layout | Yes | `proposal_role: "habitat_layout"` ✓ | ✓ |
| image → avatar_candidate | Yes | **missing** `proposal_role` field on avatar insert ✗ | `proposal_role: "avatar_candidate"` ✓ |

**Status: Fixed** — `proposal_role: "avatar_candidate"` added to the image artifact proposal insert (was previously missing; habitat_layout proposals were correct).

---

### 11. Target surface

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| habitat_layout → staging_habitat | Yes | `target_surface: "staging_habitat"` ✓ |
| avatar_candidate → identity | Yes | `target_surface: "identity"` ✓ |
| Stored on proposal_record | Yes | Both set in insert rows ✓ |

**Status: Fully implemented.**

---

### 12. Execution lane

| Attribute | Canon | Implementation |
|-----------|-------|----------------|
| Internal vs surface vs system | Surface lane for habitat + avatar | `lane_type: "surface"` on both proposal inserts ✓ |
| Caps enforced | Yes | `getMaxPendingHabitatLayoutProposals()` and `getMaxPendingAvatarProposals()` ✓ |
| No direct public/identity mutation | Yes | Proposals are `pending_review`; no publication or approval inserted by runner ✓ |

**Status: Fully implemented.**

---

### 13. Trace

| Attribute | Canon | Implementation (pre-fix) | Implementation (post-fix) |
|-----------|-------|--------------------------|---------------------------|
| `creative_session.trace` | session_mode, drive, focus, proposal, tokens, model | `mode: metabolismMode` (metabolism mode only) ✗ | `session_mode`, `metabolism_mode` ✓ |
| `creative_session.decision_summary` | project_reason, thread_reason, idea_reason, rejected_alternatives, next_action, confidence | ✓ | ✓ |
| `deliberation_trace` | observations, state_summary, tensions, hypotheses, evidence_checked, rejected_alternatives, chosen_action, confidence | `writeDeliberationTrace()` with all fields ✓ | ✓ |
| `trajectory_review` | One row per session; narrative_state, action_kind, scores | `deriveTrajectoryReview()` + insert ✓ | ✓ |
| `creative_state_snapshot` | After each artifact | `stateToSnapshotRow()` + insert ✓ | ✓ |
| Confidence | From critique/evaluation | **Hardcoded 0.7** | 0.7 (reserved; canon-acknowledged) |

**Status: Fixed** — trace JSONB previously recorded `mode: metabolismMode` (the cron/manual runtime mode) instead of `session_mode` (explore/return/reflect/continue/rest). Now both are captured as `session_mode` and `metabolism_mode` with unambiguous labels.

---

## Deviations from canon

### DEV-1: Avatar proposal missing `proposal_role` field *(Fixed)*

**Canon:** Proposal role for image artifacts must be `avatar_candidate`. The canon states: "Proposal role: Semantic label on the proposal: habitat_layout (concept → staging), avatar_candidate (image → identity)."

**Pre-fix code:**
```typescript
// manageProposals() — image path
supabase.from("proposal_record").insert({
  lane_type: "surface",
  target_type: "avatar_candidate",
  // proposal_role was absent
  target_surface: "identity",
  proposal_type: "avatar",
  ...
})
```

**Post-fix code:**
```typescript
supabase.from("proposal_record").insert({
  lane_type: "surface",
  target_type: "avatar_candidate",
  proposal_role: "avatar_candidate",   // added
  target_surface: "identity",
  proposal_type: "avatar",
  ...
})
```

**Impact:** Without `proposal_role`, filtering proposals by role would return no avatar proposals. The habitat path was correct (`proposal_role: "habitat_layout"`); only the avatar path was affected.

---

### DEV-2: Session trace JSONB used `mode` for metabolism mode, not session mode *(Fixed)*

**Canon:** "What must be logged: Session start and finish; selected mode, drive, focus." "Selected mode" refers to the session mode (explore, return, reflect, continue, rest).

**Pre-fix code:**
```typescript
// writeTraceAndDeliberation()
const metabolismMode = runtimeConfig.mode; // "cron" | "manual"
const trace = {
  mode: metabolismMode,   // metabolism mode, not session mode
  drive: state.selectedDrive ?? null,
  ...
};
```

**Post-fix code:**
```typescript
const trace = {
  session_mode: state.sessionMode,     // explore | return | reflect | continue | rest
  metabolism_mode: metabolismMode,     // cron | manual
  drive: state.selectedDrive ?? null,
  ...
};
```

**Impact:** The `creative_session.trace` JSONB was storing the metabolism/runtime mode (cron vs manual) under the key `mode`, while operators reading the trace would expect to see the session mode (explore/return/etc.). The deliberation trace correctly used `session_mode` and `metabolism_mode` already; the main session trace JSONB was inconsistent.

---

## Missing implementation

The following items are described in the canon but not currently present in the code. All are explicitly marked "reserved" or "partially implemented" in the canon's own implementation status table, so these are **documented gaps**, not regressions.

| Gap | Canon status | Notes |
|-----|-------------|-------|
| **Explicit `concept_intent` field** | Reserved | Canon: "smallest next semantic layer." No `concept_intent` field on artifact row or in prompt. Intent is inferred from medium only. |
| **Drive injected into generation prompt** | Reserved | `selectedDrive` is passed to `runSessionPipeline` but the `@twin/agent` package's treatment of this parameter (whether it enters the LLM system/user prompt) is not verified in this audit. Canon says "not in generation prompts today." |
| **Confidence derived from critique/evaluation** | Reserved | `decisionSummary.confidence` is always initialized to `0.7`. Canon acknowledges: "Confidence is defaulted unless the implementation derives it from critique/evaluation." |
| **Artifact role for non-cron sessions** | Acknowledged | `inferArtifactRole` returns `null` for non-cron concept/image artifacts. Canon notes this explicitly: "Implemented: inferArtifactRole(medium, isCron) → layout_concept \| image_concept \| null." |
| **Session modes reflect/continue/rest affecting behavior** | Partially implemented | Only `return` mode changes focus source. Other modes are passed as label to the generation prompt but do not alter any other pipeline step. |
| **Reserved proposal roles** | Reserved | `naming_candidate`, `surface_adjustment`, `system_change_proposal` exist in canon vocabulary but have no code paths. |
| **Presentation intent** | Reserved | "How content is intended to be seen" — not stored as a DB field. |

---

## Observability gaps

### OG-1: Confidence field implies derivation (pre-fix state)

`deliberation_trace.confidence` and `decision_summary.confidence` are both emitted with value `0.7`. The runtime UI or any observability layer consuming these fields may suggest the Twin is operating with high, meaningful confidence when the value is a static placeholder.

**Canon rule:** "The runtime UI should not imply that drive or non-return modes change generation logic until they do… Confidence is defaulted unless the implementation derives it from critique/evaluation."

**Status:** Not fixed in this audit (confidence derivation is a reserved feature). Operators should be aware that confidence = 0.7 is always a default.

---

### OG-2: Drive "steering" vocabulary implies influence

The `drive` field is visible in the session trace and deliberation trace. Operators may infer that the selected drive changes generation behavior. It does not today — it is stored and traced but not confirmed to be injected into LLM prompts.

**Canon rule:** "Either document that or add it to the prompt."

**Status:** Not changed in this audit. Canon documentation already notes this. No UI correction is included here; the canon is the authoritative record.

---

### OG-3: Session mode "reflect/continue/rest" in trace implies differentiated behavior

The session trace (post-fix: `session_mode`) will show values like `reflect`, `continue`, or `rest`. These modes do not currently change focus selection, prompt construction, or any pipeline behavior beyond being passed as a label to the generation model.

**Status:** Not changed in this audit. Canon is accurate. Operators should consult the canon's implementation status table when interpreting trace session_mode values.

---

### OG-4: Artifact role null for non-cron sessions

For manually triggered sessions (`isCron = false`), `artifact.artifact_role` is always `null`. This means role-based filtering in the UI will not surface manually generated concept or image artifacts. This is an acknowledged design choice in the current implementation.

---

## Suggested corrections

All code corrections from this audit have been applied to `apps/studio/lib/session-runner.ts`:

| # | File | Change | Reason |
|---|------|--------|--------|
| 1 | `session-runner.ts` | Add `proposal_role: "avatar_candidate"` to the image artifact proposal insert in `manageProposals()` | Align with canon: proposal_role is the semantic label for the proposal; was missing on avatar path while habitat path was correct |
| 2 | `session-runner.ts` | Rename `mode: metabolismMode` to `metabolism_mode: metabolismMode` and add `session_mode: state.sessionMode` in the trace JSONB in `writeTraceAndDeliberation()` | Align with canon: trace must reflect selected session mode (explore/return/etc.); metabolism mode (cron/manual) is a different concept and was conflating the two under one key |

The following are suggested for future iterations but are out of scope for this audit's minimal-change policy:

| # | Suggestion | Canon reference |
|---|------------|-----------------|
| F1 | Derive `confidence` from critique/evaluation signals instead of hardcoding 0.7 | Canon §Implementation status: "Confidence from critique: Reserved" |
| F2 | Add optional `concept_intent` field to artifact and/or generation prompt | Canon §Future semantic upgrade: concept intent |
| F3 | Confirm whether `@twin/agent` injects `selectedDrive` into LLM prompts; document or remove from prompt if not | Canon rule 3: "Either document that or add it to the prompt" |
| F4 | Extend `inferArtifactRole` to assign roles for non-cron manual sessions (if needed for UI/filtering) | Canon acknowledges null for non-cron but role is useful for operators |
