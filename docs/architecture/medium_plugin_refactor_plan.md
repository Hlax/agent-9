# Medium plugin refactor — technical plan

Technical plan for refactoring the Twin runtime so **mediums become plugin-style** instead of hardcoded branches, while preserving governance and current behavior for writing/concept/image. No code is written in this document; it is planning and analysis only.

**Context:** Current pipeline is state → mode → drive → focus → preferred medium → generation → critique/evaluation → proposals → trace. Docs identify missing systems: explicit concept intent, drive in prompt, confidence from critique, system proposal engine, medium extension system, staging patch engine. Goal: allow the Twin to detect when an idea does not fit existing mediums and create **governed extension proposals** instead of forcing bad fits.

---

## 1. Diagnosis: where the runner is hardcoded around mediums

### 1.1 Type and option surface

| Location | What is hardcoded |
|----------|-------------------|
| `apps/studio/lib/session-runner.ts` | `PreferredMedium = "writing" \| "concept" \| "image"`; `SessionRunOptions.preferMedium`, `SessionRunSuccessPayload.artifact_medium` |
| `packages/agent/src/session-pipeline.ts` | `SessionContext.preferMedium?: "writing" \| "concept" \| "image" \| null`; branch `preferImage = context.preferMedium === "image"` then `generateImage` vs `generateWriting` |
| `packages/agent/src/generate-writing.ts` | `preferMedium === "concept"` → add CONCEPT_HABITAT_GUIDANCE; output `medium: "writing" \| "concept"` |
| `packages/agent/src/generate-image.ts` | Fixed `medium: "image"` |
| `packages/core/src/enums.ts` | `artifact_medium = ["writing", "image", "audio", "video", "concept"]` (audio/video unused in pipeline) |

### 1.2 Derivation and selection

| Location | What is hardcoded |
|----------|-------------------|
| `session-runner.ts` → `derivePreferredMedium()` | Literal branches: reflection_need/unfinished_projects → "concept"; avatar/backlog or diversity/tension → "image"; cron 12% → "image"; else null (writing). Returns only `PreferredMedium \| null`. |
| `session-runner.ts` → `runGeneration()` | Calls `derivePreferredMedium()` then `runSessionPipeline(..., preferMedium)`. No registry lookup. |

### 1.3 Generation dispatch

| Location | What is hardcoded |
|----------|-------------------|
| `packages/agent/src/session-pipeline.ts` → `runSessionPipeline()` | `const preferImage = context.preferMedium === "image"`; ternary `preferImage ? generateImage(...) : generateWriting(...)`. No table or registry; adding a medium requires editing this file and adding a new generator. |
| `session-runner.ts` → post-generation | `primaryArtifact.medium === "image" && primaryArtifact.content_uri` → `uploadImageToStorage()`. Image-specific upload is hardcoded. |

### 1.4 Artifact role and proposal routing

| Location | What is hardcoded |
|----------|-------------------|
| `session-runner.ts` → `inferArtifactRole(medium, isCron)` | `medium === "concept" && isCron` → "layout_concept"; `medium === "image" && isCron` → "image_concept"; else null. No plugin or table. |
| `session-runner.ts` → `manageProposals()` | First branch `if (artifact.medium === "concept")` (eligibility, habitat cap, buildMinimalHabitatPayloadFromConcept, validateHabitatPayload, insert/update proposal_record habitat_layout). Second branch `if (artifact.medium === "image")` (avatar cap, insert avatar_candidate). No other branches; no extension proposal path. |
| `apps/studio/lib/proposal-eligibility.ts` | `if (input.medium !== "concept")` return ineligible. Only concept is eligible for the existing surface proposal path. |

### 1.5 Caps and limits

| Location | What is hardcoded |
|----------|-------------------|
| `apps/studio/lib/stop-limits.ts` | `getMaxPendingHabitatLayoutProposals()`, `getMaxPendingAvatarProposals()` — one function per proposal role. No generic “cap per proposal_role or per medium”. |

### 1.6 Persistence and state signals

| Location | What is hardcoded |
|----------|-------------------|
| `session-runner.ts` → `persistDerivedState()` | `exploredNewMedium`: recent artifacts’ `medium` list compared to current artifact.medium (string). `decisionSummary.next_action`: branches on `artifact.medium === "concept"` vs `=== "image"` for default next_action text. |
| `session-runner.ts` → `writeTraceAndDeliberation()` / trace | `generation_model` branch: `artifact.medium === "image"` → OPENAI_MODEL_IMAGE; `=== "concept"` → concept model; else generation model. `traceProposalType`: "surface" vs "avatar" from earlier branches. |

### 1.7 Critique and evaluation

| Location | What is hardcoded |
|----------|-------------------|
| `packages/evaluation/src/critique.ts` | Rubric asks for `medium_fit_note` (free text). No structured `medium_fit` enum (supported | partial | unsupported). Critique outcome set is fixed (continue, branch, shift_medium, reflect, archive_candidate, stop). |
| `packages/evaluation/src/signals.ts` | Maps critique_outcome to evaluation signals; no medium-specific logic. |

**Summary:** Every medium-dependent branch is an explicit `medium === "concept"` or `medium === "image"` or `preferMedium === "image"` (or null/writing). There is no registry, no plugin interface, and no path for “unknown” or “extension” medium. Extension proposals do not exist.

---

## 2. Target architecture: medium registry / plugin system

### 2.1 Principles

- **Registry:** A single source of “known mediums” at runtime. Each known medium has a plugin descriptor (id, status, capabilities, generator, optional proposal handler, optional upload/post-process).
- **Medium status:** `active` = runnable; `proposal_only` = known to ontology/UI but not executable (e.g. interactive_surface); `disabled` = hidden from derivation. This avoids the binary trap of “registered = runnable”: a medium can be in the registry and in docs/UI but marked proposal_only until approved.
- **Stable core:** writing, concept, image remain built-in plugins with status active; behavior is unchanged until we explicitly migrate them into the registry.
- **Requested vs executed medium:** Track two fields: **requested_medium** (what the Twin wanted, e.g. interactive_surface) and **executed_medium** (what actually ran, e.g. concept). When the Twin cannot execute the requested medium, it falls back to an executable one and records both. Preserves truthful traces and makes capability-fit easier to reason about; prevents fake medium support.
- **Unknown medium:** When requested_medium is not in the registry or has status proposal_only, the runner does **not** execute that medium’s generation. It may fall back to an executable medium (e.g. concept) and record requested_medium vs executed_medium, then create an **extension proposal** (governed) so operators can approve adding support later.
- **No autonomous execution of new mediums:** New mediums become runnable only after a governed approval path (e.g. extension proposal approved and plugin status set to active).

- **Anti-goal:** The registry refactor must **not** reintroduce medium-specific branching into the orchestrator outside of: (1) plugin resolution and execution gating (registry lookups, status/capability checks), and (2) shared governance hooks (caps, proposal lanes). All medium-specific behavior belongs inside plugins or behind registry queries. Otherwise medium logic tends to leak back into the runner over time.

### 2.2 Components

| Component | Responsibility |
|-----------|----------------|
| **Medium registry** | Map `medium_id: string` → `MediumPlugin` (with status and capabilities). Used by runner to decide: can we execute this medium? can we run proposal logic? what generator/caps to use? |
| **Medium plugin (per medium)** | Implements a small interface: id, label, status, capabilities, canDeriveFromState, generate, postProcess, proposalRole, targetSurface, isEligibleForProposal, proposalCapKey. |
| **Derivation layer** | Replaces hardcoded `derivePreferredMedium`: returns **requested_medium** (string or null). Only plugins with status active and canDeriveFromState participate. |
| **Generation dispatcher** | Given **requested_medium**, resolve **executed_medium**: if registry.isExecutable(requested_medium) then executed_medium = requested_medium; else fallback (e.g. writing/concept). Set **fallback_reason** and **resolution_source** when fallback occurs. Call plugin’s generator for executed_medium; persist and trace both. |
| **Capability-fit layer** | After critique: classify medium_fit; set missing_capability?, extension_classification? (Phase 2). Feeds extension proposal path when partial/unsupported or requested_medium ≠ executed_medium. |
| **Proposal routing** | Look up plugin for artifact.medium (executed_medium); if registry.isExecutable(medium) and registry.canPropose(medium) and proposal role and eligibility passes → surface proposal; else if requested ≠ executed or fit partial/unsupported or medium proposal_only → extension proposal. |

### 2.3 Data flow (target)

- **Preferred medium selection (requested_medium):** Either explicit (caller) or derived. Derivation: registry returns list of mediums that “want” to be considered (e.g. status active and canDeriveFromState); current-state logic or a small strategy picks one (or null → writing). Result: `requested_medium: string | null`.
- **Executed medium resolution:** If registry.isExecutable(requested_medium), then executed_medium = requested_medium and resolution_source = "derivation" (or "manual_override" only when caller explicitly set preferMedium). Else fall back to an executable medium; **fallback default is currently "writing" (temporary)** — long-term: plugin-defined fallback, registry default, or derivation retry. Set **fallback_reason** and resolution_source = "registry_constraint"; requested_medium stays as-is. fallback_reason makes requested → executed explainable (technical vs governance vs design).
- **Generation:** Registry.get(executed_medium ?? "writing"). Plugin generates → artifact with medium = executed_medium. Persist and trace requested_medium, executed_medium, fallback_reason (when set), resolution_source.
- **Post-generation:** Optional per-plugin postProcess (when capabilities.can_postprocess / can_upload). Same as today for image.
- **Critique / evaluation:** Unchanged; critique already has medium_fit_note. Add structured medium_fit (supported | partial | unsupported) derived from note or a small classifier.
- **Capability-fit and extension classification:** New step after critique: set medium_fit; set **missing_capability** (controlled vocabulary, see below) and **extension_classification** (closed enum, not freeform). Both are defined in Section 3.5. Expose in traces before Phase 3 so reasoning is testable without opening the extension proposal lane yet.
- **Proposals:** For executed_medium in registry with status active and capabilities.can_propose_surface and proposal role → existing surface flow. For requested_medium !== executed_medium, or medium_fit unsupported/partial, or medium not in registry / proposal_only → create extension proposal (when Phase 3 is live).

### 2.4 Invariants (hard guarantees)

- Every session has **exactly one** requested_medium (string or null) per generation attempt.  
- Every generation attempt has **exactly one** executed_medium (string).  
- If requested_medium !== executed_medium, then **fallback_reason** must be set (one of the FallbackReason enum values).  
- If medium_fit = supported, then **extension_classification** should normally be null.  
- **proposal_only** mediums may be registered and proposal-eligible (e.g. in extension UX) but are **never** executable; registry.isExecutable(medium) is false for them.

---

## 3. Minimal interfaces for a medium plugin

Keep the surface small so migration is incremental.

### 3.1 MediumPlugin (minimal)

```ts
// Conceptual; not code yet.
interface MediumPluginCapabilities {
  can_generate: boolean;
  can_propose_surface: boolean;
  can_postprocess: boolean;
  can_upload: boolean;
  supports_staging_target: boolean;
}

interface MediumPlugin {
  id: string;                           // e.g. "writing" | "concept" | "image" | "interactive_surface"
  label: string;                        // Human-readable
  /** active = runnable; proposal_only = known to ontology/UI but not executable; disabled = hidden from derivation. */
  status: "active" | "proposal_only" | "disabled";
  /** Descriptor for routing: avoids medium-specific conditionals in proposal and postprocess logic. */
  capabilities: MediumPluginCapabilities;
  /** Can this medium be selected by derivation from state? If false, only explicit. */
  canDeriveFromState?: boolean;
  /** Generator: (context) => Promise<ArtifactLike>. Context includes mode, workingContext, sourceContext, etc. */
  generate?(context: GenerationContext): Promise<GeneratedArtifact>;
  /** After generation, optional upload/post-process (e.g. image → storage). */
  postProcess?(artifact: Artifact, supabase: SupabaseClient): Promise<Artifact | null>;
  /** If set, this medium can create surface proposals when eligible. */
  proposalRole?: string;                // e.g. "habitat_layout" | "avatar_candidate"
  targetSurface?: string;               // e.g. "staging_habitat" | "identity"
  /** Eligibility: (artifact, evaluation, critique) => eligible. If absent, no surface proposals. */
  isEligibleForProposal?(input: EligibilityInput): EligibilityResult;
  /** Cap key for stop-limits (e.g. "habitat_layout" | "avatar_candidate"). */
  proposalCapKey?: string;
}
```

**Capabilities** keep routing explicit: only call generate when `capabilities.can_generate`, proposal logic when `can_propose_surface`, postProcess when `can_postprocess` / `can_upload`. Prevents proposal logic from becoming another pile of medium-specific conditionals and supports “registered but non-executable” (e.g. status proposal_only) later.

### 3.2 Registry (minimal)

Split resolution into three concepts so **proposal_only** and “missing” are distinct:

```ts
// Conceptual.
interface MediumRegistry {
  get(mediumId: string): MediumPlugin | undefined;
  /** Plugin exists in registry (any status). */
  isRegistered(mediumId: string): boolean;
  /** Can run generate/postProcess for this medium: status "active" and capabilities.can_generate (and can_postprocess for upload). */
  isExecutable(mediumId: string): boolean;
  /** Can create surface proposals: status "active" and capabilities.can_propose_surface and proposalRole set. */
  canPropose(mediumId: string): boolean;
  list(): MediumPlugin[];
  /** Mediums that participate in derivation (status active and canDeriveFromState). */
  listDerivable(): MediumPlugin[];
}
```

- **isRegistered:** interactive_surface can be known (in registry) but not executable.  
- **isExecutable:** only active + can_generate; use for generation dispatch.  
- **canPropose:** active + can_propose_surface; use for surface proposal routing. Proposal_only mediums are registered and may be proposal-eligible in extension UX but not executable — documenting this now keeps canExecute() from being overloaded later.

### 3.3 GenerationContext (extend existing)

Session pipeline already has mode, projectId, ideaThreadId, ideaId, workingContext, sourceContext, promptContext. Add optional `conceptIntent?: string`, `selectedDrive?: string` when those are wired. Plugin receives this; no need to change pipeline contract in phase 1 except to pass through registry.

### 3.4 GeneratedArtifact (align with current Artifact)

Current agent returns title, summary, content_text, medium, content_uri (for image). Plugin returns the same shape so existing persistence and evaluation paths stay valid.

### 3.5 Trace/state vocabulary: fallback, resolution, and classification

**fallback_reason** — Set when requested_medium ≠ executed_medium. Closed set; makes requested → executed transitions explainable and distinguishes technical vs governance vs design reasons:

```ts
type FallbackReason =
  | "unregistered"      // not in registry
  | "proposal_only"     // in registry but status proposal_only
  | "disabled"          // in registry but status disabled
  | "missing_capability" // plugin lacks required capability (e.g. can_generate false)
  | "governance_blocked" // policy or cap blocked execution
  | "unsupported_by_runtime"; // runtime does not support this medium
```

**resolution_source** — How the executed medium (or fallback) was chosen. Works with truth labels:

```ts
type ResolutionSource =
  | "derivation"          // runtime chose it (derivePreferredMedium; no explicit caller preference)
  | "manual_override"     // caller/operator explicitly forced preferMedium (e.g. API body or cron)
  | "registry_constraint" // registry prevented executing requested; fallback was applied
  | "fallback_rule";      // (future) fallback policy selected the replacement
```

**Rule:** Use **manual_override** only when the caller/operator explicitly set preferMedium (e.g. request body or cron config), not when preferMedium was derived internally. Otherwise traces become misleading (derivation vs override).

**extension_classification** — Closed enum, **not** freeform text. Use for filtering, analytics, and UI:

```ts
type ExtensionClassification =
  | "medium_extension"
  | "toolchain_extension"
  | "workflow_extension"
  | "surface_environment_extension"
  | "system_capability_extension"
  | null;
```

**Rule:** extension_classification may be **null** even when medium_fit is partial or unsupported, if the critique does not support a trustworthy classification yet. Bad classification is worse than null; do not overclassify on weak evidence.

**missing_capability** — Use a **real union type** (MissingCapabilityKey), not freeform string, so Phase 3 analytics and proposal routing stay clean. Reserve:

```ts
type MissingCapabilityKey =
  | "interactive_ui"
  | "stateful_surface"
  | "video_generation"
  | "audio_rendering"
  | "code_execution"
  | "structured_patch_application"
  | null;
```

Classifier may only use a subset initially (e.g. interactive_ui, stateful_surface); extend as new capability gaps are identified.

---

## 4. Where concept intent, drive, confidence, and capability-fit sit in the pipeline

| Signal | Current position | Target position | Notes |
|--------|------------------|-----------------|--------|
| **Concept intent** | Inferred after generation (from medium/path). | **After focus selection, before preferred medium.** Optional step: compute or select `conceptIntent` (e.g. thread_continuation, layout_spec, avatar_exploration, reflection). Pass into generation context so plugins can use it in prompts. No change to current behavior if conceptIntent is omitted; plugins can ignore it. |
| **Drive** | Computed in selectModeAndDrive; stored and traced; not in prompt. | **Unchanged position.** Add optional injection: when building generation context, include `selectedDrive` so plugin can add it to the user prompt. Writing/concept/image plugins can add “Drive: {drive}” in a later phase. |
| **Confidence** | decisionSummary.confidence default 0.7; never set from critique. | **After critique/evaluation.** New step or inside persistDerivedState: derive confidence from evaluation (e.g. mean of alignment, pull) or from critique outcome band; set `state.decisionSummary.confidence`. Trajectory review and deliberation already consume it. |
| **Capability-fit** | Only medium_fit_note (free text) in critique. | **After critique/evaluation, before manageProposals.** New step: classify `medium_fit` = supported | partial | unsupported (e.g. from medium_fit_note via keyword or small classifier, or from critique_outcome: stop/archive_candidate → partial/unsupported). Attach to state (e.g. state.mediumFit) and optionally to artifact (if we add a column or JSON). manageProposals uses it: if medium not in registry or medium_fit is partial/unsupported, route to extension proposal instead of surface proposal. |

**Pipeline order (target):**

1. State and evidence  
2. Session mode  
3. Drive  
4. Focus selection  
5. **Concept intent (optional)** — new; can be no-op initially  
6. **Requested medium** (from registry derivation or explicit)  
7. **Executed medium resolution** — if not isExecutable(requested), fall back; set fallback_reason, resolution_source; record both  
8. Generation (registry dispatch on executed_medium)  
9. Critique + evaluation  
10. **Capability-fit** — classify medium_fit; **extension classification** — missing_capability?, extension_classification? (Phase 2 trace fields)  
11. **Confidence** — set from evaluation/critique  
12. Artifact role (plugin or inferred from executed_medium)  
13. Proposal eligibility (plugin or default; use capabilities.can_propose_surface)  
14. manageProposals (surface for active + can_propose_surface; extension for requested ≠ executed or fit partial/unsupported)  
15. Proposal role / target surface / execution lane  
16. Trace (with **truth labels** and **resolution_source**; **fallback_reason** when requested ≠ executed)  

### 4.1 Observability: truth labels

**Truth label** answers *what kind of field this is* (inferred vs selected vs executed vs defaulted). **resolution_source** answers *how this value got chosen* (derivation vs fallback_rule vs registry_constraint vs manual_override). Don’t conflate them: one is the field’s provenance type, the other is the selection path.

For each trace field, record **how** it was produced so the runtime does not look smarter than it is:

- **inferred** — Derived by model or heuristic (e.g. medium_fit from critique note).  
- **selected** — Chosen by logic from options (e.g. executed_medium chosen from registry).  
- **executed** — Actually performed (e.g. generation ran for this medium).  
- **defaulted** — Fallback or placeholder when no real value exists (e.g. confidence 0.7 before critique-derived confidence).

Example: once confidence is set from critique, the trace should show it as **inferred** (or **selected** if from a band), not defaulted. This stops observers from treating defaulted values as if they were critique-derived.

**Medium resolution example:** requested_medium truth = **selected** (or **inferred** if from derivation), resolution_source = "derivation"; executed_medium truth = **executed** when no fallback, or **selected** when fallback_rule applied, with resolution_source = "fallback_rule" or "registry_constraint". Together with fallback_reason, the observability layer can show exactly why a given medium ran.

### 4.2 Persisted vs trace-only

Define what is stored durably vs only in trace to avoid duplicated half-state and unclear sources of truth.

| Where | Fields |
|-------|--------|
| **Persisted** (session / artifact / review / proposal) | requested_medium, executed_medium, medium_fit, missing_capability (controlled vocab), extension_classification, confidence, fallback_reason (when fallback), resolution_source. Truth label where relevant (e.g. confidence: inferred \| defaulted). |
| **Trace-only / ephemeral** | Fallback reasoning details (e.g. which plugins were considered), raw plugin eligibility notes, verbose capability diagnostics, intermediate derivation candidates. |

Rule: anything that drives proposals, review UI, or downstream analytics should be persisted. Detailed diagnostics and intermediate steps stay in trace only.

**Phase 2 boundary note:** Consider persisting **executed_medium** on artifact rows (e.g. `artifact.executed_medium` or in artifact metadata), not only in session trace and success payload. Analytics and review UIs that need to know “what actually ran” will benefit from a durable column; today it is trace-only.

---

## 5. How manageProposals should evolve to support extension proposals

### 5.1 Current behavior (recap)

- `artifact.medium === "concept"` → isProposalEligible (concept thresholds) → cap habitat_layout → insert/refresh proposal_record (habitat_layout, staging_habitat).  
- `artifact.medium === "image"` → no duplicate, cap avatar → insert proposal_record (avatar_candidate, identity).  
- No other branch.

### 5.2 Target behavior

- **Registered medium with proposal role:** Unchanged. Look up plugin by artifact.medium; if plugin has proposalRole, run existing eligibility/cap logic (or plugin.isEligibleForProposal), then create surface proposal as today.  
- **Registered medium, no proposal role:** No surface proposal. Optionally still create extension proposal if capability-fit is partial/unsupported (e.g. “concept” but fit poor → suggest new medium or workflow).  
- **Unregistered medium or medium_fit unsupported/partial:** Do **not** create surface proposal. Create an **extension proposal** (new type) that describes: requested or inferred medium, artifact_id, rationale (from critique/medium_fit_note), extension classification (medium_extension | toolchain_extension | workflow_extension | surface_environment_extension | system_capability_extension). Extension proposals are human-gated: operator reviews and can approve “add this medium to registry” (or reject). No autonomous execution of the new medium.

### 5.3 Extension proposal shape (payload contract)

Define the row/payload shape **now** so the later proposal lane stays clean. Reserve at least:

| Field | Purpose |
|-------|---------|
| `proposal_role` | One of **ExtensionClassification** (closed enum): medium_extension, toolchain_extension, workflow_extension, surface_environment_extension, system_capability_extension. |
| `extension_type` | Same as extension_classification (closed enum); alias for proposal_role. |
| `proposed_medium` | The medium that was requested or inferred (e.g. interactive_surface). |
| `missing_capability` | Optional; from Phase 2 capability-fit. Use **controlled vocabulary** (Section 3.5): e.g. interactive_ui, stateful_surface, video_generation, audio_rendering, code_execution, structured_patch_application; extend as needed. |
| `required_capabilities` | Optional; list of capability keys the extension would need. |
| `supporting_tools` | Optional; tools or stack that would support this extension. |
| `source_artifact_id` | The artifact that didn’t fit or triggered the proposal. |
| `rationale` | From critique/medium_fit_note or derived. |
| `affects_surface` | Boolean or surface id (e.g. staging_habitat, identity). |
| `affects_identity` | Boolean; whether the extension touches identity surface. |
| `execution_risk` | Optional; low \| medium \| high for operator review. |
| `lane_type` | e.g. "extension" (new lane) or reuse "system". |
| `target_type` | e.g. "medium_extension". |
| `title`, `summary` | From artifact + rationale. |
| `proposal_state` | pending_review. |

No apply path in runner; apply = “operator adds plugin to registry / deploys config” outside the session runner.

### 5.4 Caps for extension proposals

- Cap per extension classification or single cap for “pending extension proposals” to avoid unbounded backlog. Exact cap can be env-driven (e.g. MAX_PENDING_EXTENSION_PROPOSALS).

---

## 6. Case A: interactive_surface without breaking governance

### 6.1 Requirement

Interactive/stateful habitat experiences are a first-class extension path. Proposed medium could be `interactive_surface`. It must go through governed proposal creation, not direct staging mutation.

### 6.2 Representation

- **As a medium id:** `interactive_surface` is a string that the Twin can *request* or that can be *inferred* when critique/content suggests an interactive experience (e.g. “visitors can explore”, “stateful flow”). **Long-term model:** known by ontology, optionally in the registry, but marked **proposal_only** until approved — so “in registry” does not mean “runnable”. So:
  - **Option A (not in registry):** As today, the Twin does not run an interactive_surface generator; requested_medium can be interactive_surface, executed_medium falls back to concept/writing.
  - **Option B (in registry, status proposal_only):** Register interactive_surface with status `proposal_only` and capabilities.can_generate = false. It appears in ontology, docs, and UI; derivation can even “want” it (requested_medium), but the runner never executes it. executed_medium is set to concept or writing; both are recorded. This avoids the binary trap of “registered = runnable”.
  - When the runner sees requested_medium = "interactive_surface" and the plugin is missing or proposal_only, executed_medium = fallback (e.g. concept); requested_medium stays for trace truth; extension proposal can be created.
- **Extension proposal:** When the Twin produces a concept or writing that implies an interactive experience (e.g. capability-fit partial + medium_fit_note mentions “interactive”), the runner creates an **extension proposal** with:
  - proposal_role: e.g. `surface_environment_extension` or a dedicated `interactive_surface_extension`
  - target_surface: e.g. `staging_habitat` or a new value `interactive_staging`
  - summary/title describing the desired interactive experience; source_artifact_id linked.

### 6.3 Governance

- **No direct staging mutation:** The runner never executes “apply interactive_surface” or mutate staging beyond what current habitat_layout proposals do (static layout payload). Applying an “interactive_surface” would require a separate, human-gated flow (e.g. approve extension proposal → operator deploys or enables a feature).  
- **Review:** Extension proposals appear in a dedicated review UI (e.g. “Extension proposals”) so operators can approve/reject. Approval does not auto-add the medium to the registry; it can trigger a deploy step or config change that adds the plugin later.

### 6.4 Summary

- `interactive_surface` is represented as a **medium id** that is **not** in the registry initially.  
- When the Twin detects an idea that fits interactive_surface (via intent or capability-fit), it creates an **extension proposal** (surface_environment_extension or interactive_surface_extension), not a surface proposal.  
- No autonomous execution; no direct staging mutation. Canon and governance docs can explicitly state that interactive_surface is an extension path only until a plugin is registered and approved.

---

## 7. Migration plan (phases)

### Sneak in now (hooks) vs do later (real systems)

**Sneak in now** — cheap and prevent rework; no full new behavior required:

- Plugin **capabilities** and **status** (Phase 1).
- **requested_medium** vs **executed_medium**; **fallback_reason** and **resolution_source** when fallback (Phase 1).
- **isRegistered / isExecutable / canPropose** (Section 3.2) — document now so canExecute() doesn’t get overloaded.
- Phase 2 trace fields: **medium_fit**, **missing_capability** (controlled vocab), **extension_classification** (closed enum).
- **Extension proposal payload** shape (Section 5.3) — define now; use when Phase 3 is live.
- **Truth labels** and **persisted vs trace-only** (Sections 4.1, 4.2).

**Do later** — real systems, not just hooks:

- Real interactive_surface execution (plugin with status active + can_generate).
- Full staging patch engine.
- Pressure model steering mode / drive.
- Sophisticated intent classifier.
- Pluggable medium derivation competition between many plugins.

---

### Phase 1: Registry + built-in plugins (no behavior change)

- Add `packages/mediums` (or `apps/studio/lib/medium-registry`) with: MediumRegistry (isRegistered, isExecutable, canPropose), MediumPlugin interface (including status and capabilities), and three built-in plugins (writing, concept, image) with status active that wrap current behavior.  
- Register writing, concept, image at startup or first use.  
- Runner: treat derivation output as **requested_medium**; resolve **executed_medium** via registry.isExecutable(requested_medium) (else fallback to writing); set **fallback_reason** and **resolution_source** when fallback occurs. Replace direct `generateWriting`/`generateImage` with `registry.get(executed_medium ?? "writing").generate(context)`. Persist and trace requested_medium, executed_medium, fallback_reason (when set), resolution_source.  
- Derivation: keep `derivePreferredMedium` as-is but have it return the same strings (requested_medium); registry.isExecutable(that) will be true for all three built-ins.  
- manageProposals: keep current branches; no extension proposals yet.  
- **Risk:** Low. Behavior is unchanged; only the call path goes through the registry; requested/executed are equal for built-ins.

**Phase 1 success criteria (no-op success):**

- writing / concept / image behavior remains **functionally identical** (outputs same or near-same).  
- Only **architecture** changes (registry path, interfaces).  
- Traces gain **requested_medium** and **executed_medium** visibility (and fallback_reason / resolution_source when applicable).  
- **No new governance authority** is introduced (no extension proposals, no new approval paths).  
- If any of these are violated, Phase 1 is incomplete or bloated.

**Phase 1 self-audit: remaining medium-specific branching in runner.** The following remain **intentionally** in the orchestrator until proposal routing and artifact role use the registry (Phase 3+): `inferArtifactRole(medium, isCron)` (concept/image branches), `manageProposals` (artifact.medium === "concept" / "image"), `persistDerivedState` (next_action by artifact.medium), `writeTraceAndDeliberation` (generation_model by artifact.medium), image upload branch (`primaryArtifact.medium === "image"`). These are the single source of truth for *current* proposal and trace behavior; plugin metadata (proposalRole, etc.) is reserved for when the runner switches to registry-based routing. Do not add new medium branches in the runner; new behavior belongs in plugins or registry resolution.

**proposal_only in Phase 1:** At the registry API level, `proposal_only` is treated as both non-executable and non-proposable (`isExecutable` and `canPropose` false). Later phases may distinguish “proposal-eligible as a target medium” (e.g. for extension proposals) from “proposal-capable as an executing plugin” (surface proposals).

**Phase 1 accepted contract (freeze):**

- **Registry-backed resolution** is now the authoritative path for medium execution choice (requested_medium → executed_medium via registry.isExecutable; fallback when not executable).
- **Old behavior is preserved:** writing / concept / image outputs and proposal behavior are unchanged; only the call path goes through the registry.
- **No new proposal or governance behavior** is active (no extension proposals, no new approval paths).
- **Remaining runner branches** (inferArtifactRole, manageProposals, persistDerivedState, trace, image upload) are **intentional and temporary** until Phase 3+.
- **Future medium growth** must go through the registry/plugin architecture; do not add new hardcoded medium branches in the runner.

Use this contract to reject accidental regressions (e.g. new `if (medium === "x")` in the runner instead of a new plugin).

**Test backlog:**

- **Full session trace integration test (queued):** Verify that a real session run persists to the session/trace store: `requested_medium`, `executed_medium`, `fallback_reason` (when applicable), `resolution_source`. Current tests validate the resolution helper seam only; this test would cover the full persisted session path. Implement when convenient (e.g. before or during Phase 2).

### Phase 2: Capability-fit, confidence, and extension classification output (trace-first)

- Add **medium_fit** classification (supported | partial | unsupported) from critique (medium_fit_note and/or critique_outcome). Attach to state; persist in trace.  
- **Extension classification output:** Store in trace/state (before Phase 3): **missing_capability** (controlled vocabulary when partial/unsupported), **extension_classification** (closed enum; null when supported). Expose in traces so the reasoning layer is testable without opening the extension proposal lane yet.  
- **Critique-derived confidence:** Derive confidence from evaluation (e.g. mean of alignment_score, pull_score) and set decisionSummary.confidence; set **confidence_truth** (inferred | defaulted) so trace is honest.  
- **No new proposal types yet.** Phase 2 increases descriptive honesty only; no extension proposals, no new governance.  
- **Heuristic note:** unsupported = outcome "stop" or (outcome "archive_candidate" **and** note suggests medium/body mismatch). archive_candidate alone can mean “not worth continuing” (low value), not necessarily wrong medium; treat as partial unless the note supports mismatch.  
- **Risk:** Low. Additive; existing flows unchanged.

**Phase 2 success criteria:**

- **Confidence** is either critique-derived (or from evaluation) or explicitly marked **defaulted** in trace (truth label).  
- **medium_fit** (and missing_capability, extension_classification) appear in trace without creating new governance side effects (no new approval paths, no extension proposal creation).  
- **No extension proposals** are created in Phase 2; extension proposal creation only when Phase 3 is implemented.

**extension_classification null is valid:** extension_classification may be null even when medium_fit is partial or unsupported, if the critique does not support a trustworthy classification yet. Bad classification is worse than null at this stage; do not overclassify on weak evidence.

**Phase 2 accepted contract (freeze):**

- **Capability-fit fields are descriptive only** (no extension proposals, no new governance or proposal routing).  
- **Confidence** is critique/evaluation-derived when available, otherwise explicitly **defaulted** (confidence_truth).  
- **No extension proposals** are created; no governance or proposal routing changes.  
- **Existing artifact/proposal behavior** remains unchanged.  
- Use this contract to catch regressions (e.g. capability-fit driving proposal branches before Phase 3).

**Future option:** Add `capability_fit_source` or equivalent provenance if capability-fit classification later needs stronger observability (e.g. inferred from critique_outcome vs critique_note vs combined). No implementation in Phase 2.

### Phase 3: Extension proposal path

**Extension proposal eligibility (gating — minimum threshold):** Create an extension proposal **only** when all of the following are true; otherwise do not create. Keeps Phase 3 from generating noisy proposals from weak partial-fit cases.

- **source_artifact_id exists** — the artifact that triggered the fit assessment is present.  
- **medium_fit** is partial or unsupported (not supported).  
- **extension_classification** is non-null — we have a trustworthy classification, not weak evidence.  
- **Concrete support** — at least one of: (1) **missing_capability** is non-null; (2) **critique.medium_fit_note** clearly indicates medium/body mismatch; (3) **critique.overall_summary** clearly supports the rationale. This keeps the runtime conservative.  
- **Proposal cap / governance** allows it — current session is not already proposal-saturated (e.g. MAX_PENDING_EXTENSION_PROPOSALS not reached); governance rules permit the creation.

Keep creation **conservative**: when in doubt, do not create; extension proposals are for high-signal cases only.

- Add extension proposal creation in manageProposals when the **eligibility conditions above** are met: create proposal_record with lane_type **system** (temporary operational reuse; no extension lane in DB yet) and proposal_role from extension_classification. Extension proposals are distinguished by **target_type = extension** and an extension-classified **proposal_role** (e.g. medium_extension, surface_environment_extension).  
- Add caps (e.g. MAX_PENDING_EXTENSION_PROPOSALS).  
- Add governance rule: extension proposals have no apply path in runner; operator action only.  
- **Risk:** Medium. New row shape and review UI; ensure no apply is ever called from runner.

**Dedupe (current vs future):** Current dedupe is by (artifact_id, proposal_role) — do not create a second pending extension proposal for the same artifact and role. Future dedupe may need to consider materially equivalent capability gaps across sessions (e.g. same missing_capability + similar rationale from different artifacts).

**Anti-spam (proposal_only):** Repeated fallback from the same proposal_only requested medium should not create repeated pending extension proposals unless the rationale is materially different. No implementation required in Phase 3; note for future hardening.

**Phase 3 accepted contract (freeze):**

- **Extension proposals are creation-only** — no apply path in runner; operator action only.  
- **No new medium execution** — Phase 3 does not add any executable medium or plugin.  
- **Concept/image proposal behavior unchanged** — surface proposals (habitat_layout, avatar_candidate) work as before.  
- **lane_type = system** is temporary operational reuse for extension proposals; they are identified by target_type = extension and extension-classified proposal_role.  
- **Plugin metadata remains reserved, not authoritative** in Phase 3 — proposal routing still uses existing medium branches; plugin proposalRole/canPropose are for Phase 3+ only.  
- Use this contract to catch regressions (e.g. extension apply in runner, or plugin metadata driving routing before migration).

### Phase 4: Concept intent and requested vs executed medium

- Add optional concept intent step after focus; pass into generation context. Concept intent helps extension classification and truthfulness more directly than drive.  
- Wire **requested_medium** and **executed_medium** through pipeline and trace: derivation sets requested_medium; resolution sets executed_medium (fallback when requested not executable); both stored and exposed in traces.  
- **Risk:** Low. Optional intent; requested/executed is additive and preserves truthful traces.

### Phase 5: interactive_surface and extension UX

- When capability-fit or intent suggests interactive experience, set extension classification to surface_environment_extension (or interactive_surface_extension).  
- Document interactive_surface as first-class extension path; add review UI for extension proposals.  
- **Risk:** Low if Phase 3 is done; mainly UX and canon.

### Phase 6: Drive in prompt

- Pass selectedDrive into generation context; writing/concept plugins add drive to user prompt.  
- **Risk:** Low. Useful for UX but less structurally urgent than intent and requested/executed medium.

### Phase 7: Pluggable derivation and pressure-informed selection

- Replace hardcoded derivePreferredMedium with registry.listDerivable() + strategy (e.g. current thresholds as “default” strategy).  
- Allow new plugins to be registered (e.g. from config or after extension approval). Optionally: pressure model or drive-informed selection between many plugins.  
- **Risk:** Higher. Requires clear story for “who registers what and when” and for deploy/approval of new plugins.

---

## 8. Files likely to change

| Area | Files |
|------|--------|
| **Registry and plugins** | New: `packages/mediums/src/registry.ts`, `packages/mediums/src/plugins/writing.ts`, `concept.ts`, `image.ts` (or under apps/studio/lib/medium-registry). New: `packages/mediums/src/types.ts` (MediumPlugin, GenerationContext, etc.). |
| **Agent** | `packages/agent/src/session-pipeline.ts` — accept registry or medium id, call registry.get(medium).generate(context) instead of ternary generateImage/generateWriting. `packages/agent/src/generate-writing.ts`, `generate-image.ts` — may stay as-is and be called from plugins. |
| **Runner** | `apps/studio/lib/session-runner.ts` — derivePreferredMedium → requested_medium; resolve executed_medium via registry.isExecutable, set fallback_reason/resolution_source when fallback; runGeneration: registry.get(executed_medium).generate; postProcess via plugin; inferArtifactRole from plugin; manageProposals: branch by registry.isExecutable/canPropose and medium_fit, add extension proposal branch; persistDerivedState: confidence, requested/executed, fallback_reason, resolution_source; add capability-fit step after critique. |
| **Proposal eligibility** | `apps/studio/lib/proposal-eligibility.ts` — generalize to accept medium and optional plugin.isEligibleForProposal, or keep concept-only and add extension-eligibility in runner. |
| **Stop limits** | `apps/studio/lib/stop-limits.ts` — add getMaxPendingExtensionProposals() or generic getMaxPendingProposals(role). |
| **Governance** | `apps/studio/lib/governance-rules.ts` — add proposal states or lanes for extension if needed; document that extension apply is out-of-band. |
| **Evaluation / critique** | `packages/evaluation/src/critique.ts` — optional: add structured medium_fit in rubric (supported/partial/unsupported) or derive in runner from medium_fit_note. |
| **Schema / types** | `packages/core/src/enums.ts` — artifact_medium may stay; add optional medium_fit on artifact or in trace. Migration: optional column artifact.medium_fit or deliberation/artifact metadata. |
| **Observability** | `apps/studio/lib/ontology-helpers.ts`, `deliberation-trace.ts`, `trajectory-review.ts` — include medium_fit, confidence, requested_medium, executed_medium, fallback_reason, resolution_source; truth labels per field (Section 4.1); respect persisted vs trace-only (Section 4.2). |
| **API / review UI** | New or existing: extension proposals list and detail (e.g. review/extension or review/system with filter). |

---

## 9. Risks, edge cases, and what stays human-gated

### 9.1 Risks

- **Registry lifecycle:** If plugins are loaded from config or DB, bad config could break derivation or generation. Mitigation: built-in plugins are always present; optional plugins are validated before registration.  
- **Backward compatibility:** Existing sessions and artifacts have medium = writing | concept | image. New fields (medium_fit, extension proposal, requested_medium, executed_medium, fallback_reason, resolution_source) must be optional and nullable.  
- **Performance:** Registry lookup is trivial; no extra latency. Plugin invocation is the same as today (one generation call).  
- **Testing:** Current tests assume hardcoded branches. Tests should be updated to “registry with built-in plugins only” so behavior is unchanged; then add tests for “unknown medium → extension proposal”.

### 9.2 Edge cases

- **Explicit requested_medium unregistered or proposal_only:** Caller passes requested_medium = "interactive_surface". Runner: registry.isExecutable returns false (unregistered → fallback_reason "unregistered"; proposal_only → "proposal_only"). Set executed_medium = fallback; fallback_reason and resolution_source = "manual_override" or "registry_constraint"; produce artifact and optionally extension proposal linked via source_artifact_id.  
- **Critique says shift_medium but no plugin for target:** Keep current behavior (artifact stays its medium); capability-fit can be partial; extension proposal can cite “suggested shift to X”.  
- **Duplicate extension proposals:** Cap total pending extension proposals; optionally dedupe by (artifact_id, proposal_role) or by (summary hash, role).

### 9.3 What remains human-gated

- **Approval and application of surface proposals** (habitat, avatar): unchanged.  
- **Approval of extension proposals:** New. Operator must approve; “apply” for extension = add medium to registry or deploy config, which is out-of-band (not in session runner).  
- **Registration of new mediums:** New mediums become runnable only after operator (or deploy) adds a plugin to the registry. No autonomous self-registration.  
- **Staging and public mutation:** Unchanged. No direct staging auto-mutation; interactive_surface does not apply itself.

---

## 10. Canon docs: amend vs new doc

### 10.1 Recommend: one new canon doc + targeted amendments

- **New doc:** `docs/canon_v2/02_runtime/medium_plugins_and_extensions.md` (or under 01_foundation). Contents: (1) medium as plugin: registry, plugin contract, status, capabilities, built-in mediums. (2) requested_medium vs executed_medium; capability-fit and extension classification. (3) Extension proposal payload and classifications. (4) Governance: no autonomous execution; extension apply is human/deploy. (5) interactive_surface as first-class extension path (known by ontology, optionally in registry as proposal_only). (6) Implementation status: phase 1 = registry + built-ins; phase 2 = capability-fit/confidence/extension classification; phase 3 = extension proposals; phase 4 = intent + requested/executed; phase 5 = interactive_surface UX; phase 6 = drive in prompt; phase 7 = pluggable derivation.

- **Amend existing:**  
  - `docs/canon_v2/01_foundation/twin_decision_system.md`: In “Decision pipeline”, add one line for “Capability-fit (after critique)” and “Confidence (from critique/evaluation)”. In “Implementation status”, add row for “Medium registry/plugins” and “Extension proposals”.  
  - `docs/canon_v2/01_foundation/light_ontology.md`: Add `medium_fit` (supported | partial | unsupported) and extension proposal roles (medium_extension, toolchain_extension, workflow_extension, surface_environment_extension, system_capability_extension) as reserved or implemented when done.  
  - `docs/architecture/current_vs_potential_systems.md`: Update “Medium extension” from “Not implemented” to “Phase 1: registry; Phase 3: extension proposals” and add “Extension proposal engine” to the table.

### 10.2 What not to do

- Do not rewrite the whole decision pipeline in canon before implementation. Add only the minimal pipeline steps (capability-fit, confidence) and the new concepts (registry, extension proposal, interactive_surface as extension).

---

## Summary

| Item | Conclusion |
|------|------------|
| **Hardcoding** | All medium branching is in session-runner (derive, role, proposals, trace, upload), session-pipeline (generate dispatch), proposal-eligibility (concept only), and stop-limits (per-role caps). |
| **Target** | Registry of MediumPlugins (isRegistered, isExecutable, canPropose); derivation and generation dispatch via registry; capability-fit after critique; extension proposals for unsupported/partial or unknown medium. |
| **Anti-goal** | No medium-specific branching in orchestrator outside plugin resolution, execution gating, and shared governance hooks. |
| **Plugin interface** | id, label, status, capabilities, canDeriveFromState, generate, postProcess, proposalRole, targetSurface, isEligibleForProposal, proposalCapKey. |
| **Trace/state** | requested_medium, executed_medium, fallback_reason, resolution_source; extension_classification (closed enum), missing_capability (controlled vocab); truth labels; persisted vs trace-only (Section 4.2). |
| **Pipeline** | requested_medium → executed_medium resolution (fallback_reason, resolution_source when fallback); capability-fit, extension classification, confidence; truth labels; manageProposals: isExecutable + canPropose → surface, else extension. |
| **Phase 1 success** | Behavior identical; only architecture changes; traces gain requested/executed/fallback_reason/resolution_source; no new governance. |
| **Phase 2 success** | Confidence critique-derived or explicitly defaulted; medium_fit outputs in trace; no extension proposals created. |
| **manageProposals** | Keep surface path for registered mediums with proposal role; add branch for unregistered or partial/unsupported → create extension proposal (new lane/role). |
| **interactive_surface** | Known by ontology; optionally in registry with status proposal_only (not runnable). requested_medium can be interactive_surface; executed_medium falls back; extension proposal (surface_environment_extension); no direct staging mutation. |
| **Migration** | Seven phases: registry + built-ins → capability-fit/confidence/extension classification → extension proposals → concept intent + requested/executed medium → interactive_surface UX → drive in prompt → pluggable derivation. |
| **Files** | New: packages/mediums (or studio medium-registry), plugin implementations. Changed: session-runner, session-pipeline, proposal-eligibility, stop-limits, governance-rules, evaluation/critique (optional), core (optional medium_fit), observability, review API. |
| **Risks** | Registry config, backward compatibility, tests. Edge cases: explicit unregistered medium, shift_medium to unknown. |
| **Human-gated** | All approval/apply; registration of new mediums; extension apply (out-of-band). |
| **Canon** | New doc for medium plugins and extensions; amend twin_decision_system, light_ontology, current_vs_potential_systems. |
