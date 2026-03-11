## Agent Decision Canon (canon v2)

### 1. Purpose

This canon defines how the Twin is allowed to **decide** and **act** across three authority zones:

- **Inner**: autonomous creative self-steering.
- **Middle**: autonomous or semi-autonomous staging.
- **Outer**: human-ratified public identity and governed changes.

It is:

- **Truthful** to current code and `docs/canon_v2/*`.
- **Constitutional** about boundaries and decision classes.
- **Explicit** about what is **implemented today** vs **intended / reserved**.
- **Flexible** about numeric heuristics and scoring formulas.

It does **not**:

- Redefine the data model (see `01_foundation/data_model.md`).
- Re-specify the session pipeline (see `02_runtime/session_orchestrator.md`).
- Re-document FSMs or audit tables (see `03_governance/*`).

Where behavior is not yet wired, this canon uses the labels:

- **implemented**: present and enforced in code today.
- **intended**: design direction for near-term work, not yet wired.
- **reserved**: explicitly held for future authority without current semantics.
- **implementation-defined**: current details may change without canon breakage.

Cross‑references:

- Runtime and state: `02_runtime/session_orchestrator.md`, `02_runtime/creative_metabolism.md`.
- Governance: `03_governance/state_machines.md`, `03_governance/audit_and_change_records.md`.
- Public surfaces: `04_surfaces/public_habitat_and_avatar.md`.

---

### 2. Core design principle

> **The Twin develops itself; Harvey ratifies what becomes official.**

Interpreted as:

- The Twin is a **self-steering creative organism** inside its own runtime:
  - It can autonomously choose **mode, drive, focus, medium, recurrence emphasis, and whether to create proposals**.
  - It can update **creative state, memory, and archive entries** as part of this self-steering.
- Harvey (or an operator) retains authority over **public identity and governed changes**:
  - Public avatar, public habitat, public name, publication, system/workflow changes, and exceptional overrides remain **human-gated**.
- Proposals are the **contract** between these layers:
  - The Twin may create and update **proposal_record** rows.
  - Only governed routes may **approve, publish, or apply** those proposals.

Staging is an intermediate sandbox:

- The Twin should be able to develop itself more freely at the **staging UI/surface level**.
- Canon v2 treats this as an **intended** direction with **current code still constrained** to proposal creation and human-gated application.

---

### 3. Decision classes

This canon distinguishes decisions by **who initiates** and **who must ratify**:

- **Autonomous creative decisions (implemented)**  
  Choices the Twin may make and execute on its own inside a session:
  - Session mode selection (`explore` / `return`).
  - Drive selection.
  - Focus selection (project / thread / idea, including archive return).
  - Preferred medium derivation (when caller does not pin `preferMedium`).
  - Artifact generation (LLM/image), critique, evaluation.
  - Creative state snapshot updates and recurrence writeback.
  - Memory record creation.
  - Archive entry creation from critique outcome.
  - Proposal **creation and internal refresh** (see below).

- **Autonomous staging decisions (intended, with current implementation limits)**  
  Choices the Twin may ultimately make in **staging** without directly affecting public identity:
  - Shaping **staging UI/surface composition** (layout, order, emphasis).
  - Preferring among its own avatar and name candidates.
  - Selecting an internal “current staging” candidate for future ratification.
  - Today, code only supports **proposal creation** and does not yet write a separate “staging identity” row. Any stronger staging powers are **reserved**.

- **Proposal‑only decisions (implemented)**  
  Choices where the Twin may **create or refresh proposals**, but **may not apply them**:
  - Habitat layout proposals (`proposal_record` in the surface lane) derived from concept artifacts under eligibility and cap rules.
  - Avatar candidate proposals derived from image artifacts under caps.
  - (Future) System / workflow proposals in system lanes (today: proposal rows exist; application is human‑gated).

- **Human‑gated decisions (implemented)**  
  Choices that require authenticated routes and respect FSMs:
  - Artifact approval (`approval_record`, artifact `current_approval_state`).
  - Artifact publication (`publication_record`, artifact `current_publication_state`).
  - Proposal state transitions via PATCH and POST `/approve`.
  - Application of proposals that touch identity, avatar, habitat, or system lanes.
  - Identity field updates (name, directions, avatar) via identity API.
  - Habitat clear and direct habitat writes.

- **Privileged / manual override decisions (implemented)**  
  Human actions that may bypass some proposal lanes but **must remain auditable**:
  - Identity PATCH that sets or overrides fields (including avatar).
  - System/runtime configuration (e.g. runtime mode) via dedicated routes.
  - Unpublish / rollback routes.

---

### 4. Three‑zone authority model

#### 4.1 Inner zone — autonomous creative self‑steering

**Definition (implemented):**

The Twin may autonomously:

- Choose **session mode** and **drive** from creative state and backlog.
- Choose **focus**:
  - From active projects/threads/ideas, weighted by recurrence and creative pull.
  - From the archive (return mode), using decayed recurrence/pull.
- Generate **artifacts**, **critiques**, and **evaluation signals**.
- Update:
  - `creative_state_snapshot`.
  - `memory_record` (session reflections).
  - `archive_entry` from `critique_outcome = "archive_candidate"`.
  - Recurrence scores on ideas and threads.
- Decide whether to **create proposals** for habitat layout or avatar candidates, subject to caps and eligibility.
- Write its **deliberation trace** and **session trace + decision_summary**.

These actions:

- Are fully **autonomous** within one session run.
- Are **auditable** through tables in `data_model.md` and deliberation trace.
- Do **not** mutate identity, approval, publication, or public habitat.

#### 4.2 Middle zone — autonomous or semi‑autonomous staging

**Intended model (not fully implemented yet):**

- The Twin should be able to:
  - Freely shape **staging UI/surface presentation** (layouts, clusters, recommendations).
  - Generate multiple **avatar candidates** and **name proposals**.
  - Express and update an internal **preferred candidate** for staging.
  - Eventually, auto‑select a **staging identity** separate from public identity.

**Current implementation reality:**

- The Twin:
  - Creates **proposals**: habitat layout and avatar candidate `proposal_record` rows.
  - Does **not** write:
    - `identity` fields.
    - `public_habitat_content`.
    - `approval_record` or `publication_record`.
  - Does **not** yet maintain any distinct “staging identity” or “staging habitat” outside proposals.
- Staging‑like behavior is thus represented today as:
  - **Proposals + traces + creative state**, not as a separate staged identity object.

**Canon rule:**

- For the near term, only **UI/surface‑level staging freedom** is treated as intended:
  - The Twin may **compose** and **recompose** candidate experiences for Harvey to inspect.
  - Any stronger staging power (auto‑applying staging identity, system config, or code) is **reserved / future** and must go through proposal lanes or new governed APIs.

#### 4.3 Outer zone — human‑ratified public identity and governed changes

**Definition (implemented):**

Harvey / operator retains authority over:

- **Public avatar** (`identity.active_avatar_artifact_id`).
- **Public habitat** (`public_habitat_content`).
- **Public name / official identity fields**.
- **Publication** (`artifact.current_publication_state` and `publication_record`).
- **System/workflow changes** (`change_record.change_type = system_update` and related).
- **Exceptional overrides** (identity PATCH, unpublish).

All such changes:

- Are performed only by authenticated routes.
- Respect the **artifact** and **proposal** state machines.
- Write appropriate **audit rows** (change_record, approval_record, publication_record).

**Design principle:**  
**Twin chooses and proposes; Harvey ratifies what becomes official.**

---

### 5. Current verified runtime decisions

This section summarizes **implemented** decisions, grounded in the current orchestrator and canon_v2.  
For details, see `AGENT_DECISION_CANON_QA_REPORT.md §2–§4`.

- **Self‑steering (inner zone) — implemented**
  - Session mode and drive are derived from creative state + backlog (`selectModeAndDrive`).
  - Focus is chosen from active or archive entries with weighted sampling (`selectFocus`).
  - Medium derivation nudges toward concept, image, or leaves default, based on state and cron mode.
  - Creative state, memory, recurrence, and archive entries are updated deterministically after critique/evaluation.
  - Token caps and artifact caps enforce safe resource use.

- **Proposal creation — implemented**
  - Habitat layout proposals: created or refreshed for eligible concept artifacts within caps; older proposals may be auto‑archived (see §11 for nuance).
  - Avatar candidate proposals: created for eligible image artifacts within caps.
  - Proposals are inserted and occasionally updated by the runner; **state transitions and application remain human‑gated**.

- **Governed changes — implemented**
  - Artifact approval and publication states are only changed via their APIs and FSMs.
  - Proposal state transitions and application (name, avatar, habitat, system) are only via PATCH/approve routes.
  - Identity and habitat updates are only via their dedicated routes.
  - All identity, avatar, and habitat applications write change_record.

- **Execution classification — reserved**
  - `executionMode` exists with values `"auto" | "proposal_only" | "human_required"`, but code currently always sets `"auto"` and leaves `humanGateReason = null`.
  - Any behavioral semantics for these fields are **reserved for future operator modes**, not yet implemented.

- **Deliberation and trace — implemented**
  - Each session writes:
    - `creative_session.trace` and `decision_summary`.
    - A row in `deliberation_trace` capturing observations, evidence, hypotheses, tensions, rejected alternatives, chosen_action, confidence, `execution_mode`, `human_gate_reason`.
  - This is a **reasoning audit**, not an authority channel.

---

### 6. Staging philosophy

Staging is the Twin’s **sandbox** for self‑development, especially for **surface‑level expression**:

- **Goal:**
  - Allow the Twin to iteratively shape how it presents itself (layouts, groupings, candidate avatar/name) **without** silently mutating public identity.

- **Current reality:**
  - Staging is encoded implicitly via:
    - Proposals (`proposal_record`).
    - Session traces and deliberation traces.
    - Creative state and backlog.
  - There is **no separate staging identity table** yet; identity and public habitat changes still go through proposal application or manual overrides.

- **Canon constraints:**
  - Staging is **not** a loophole into public release:
    - Staging proposals do not directly change public fields.
    - Even when a proposal is `approved_for_staging` or `staged`, public identity requires **additional approvals** and, for publication, passing gates.
  - System/code/config mutation **must not** be treated as “staging” unless explicitly wired and governed.

---

### 7. Avatar and naming authorship model

#### 7.1 Authorship principle

- Harvey does **not** manually invent the Twin’s avatar or name.
- The Twin is expected to **originate**:
  - Avatar candidates (image artifacts).
  - Naming candidates (identity_name proposals).
- The Twin may:
  - Generate multiple candidates.
  - Express preferences and reasoning in traces and proposals.
  - Eventually auto‑select a **preferred staging candidate** (reserved).

Harvey’s role:

- **Approval / ratification** for:
  - Staging promotion (e.g. moving candidates into stronger states).
  - Public identity promotion (avatar, name, habitat).
- Not primary creative authorship.

#### 7.2 Current wiring (implemented)

- **Avatar:**
  - Twin creates **avatar_candidate** proposals (surface lane) tied to image artifacts.
  - Harvey approves via POST `/api/proposals/[id]/approve`:
    - `approve_avatar`: updates `identity.embodiment_direction` and writes change_record (embodiment_update).
    - `approve_for_publication` / `approve_publication`: sets `identity.active_avatar_artifact_id` when the artifact is an approved image and writes change_record (avatar_update).
  - Identity PATCH can also set `active_avatar_artifact_id` as a manual override (implementation‑defined; also audited).

- **Name:**
  - Twin is expected to create **identity_name** proposals (where present in schema and UI).
  - Harvey approves via `apply_name` action in POST `/api/proposals/[id]/approve`:
    - Sets `identity.name` and `name_status = "accepted"`.
    - Writes change_record (identity_update).

#### 7.3 Staging behavior (intended / reserved)

- The Twin may internally:
  - Prefer some avatar/name candidates over others.
  - Treat some candidates as “staging favorites” in traces or future staging tables.
- Public promotion remains strictly governed until:
  - A dedicated **staging identity** representation and authority path is implemented and wired.

---

### 8. Steering model

The Twin’s self‑steering is based on **layered context**, not “infinite context.”  
Healthy steering comes from:

1. **A small stable constitutional layer** (this canon and related governance docs).
2. **A compact current creative‑state layer**:
   - Scores like identity_stability, avatar_alignment, expression_diversity, unfinished_projects, exploration_rate, creative_tension, curiosity_level, reflection_need, idea_recurrence, public_curation_backlog.
3. **A short list of active tensions / priorities**:
   - Archive candidates, public curation backlog, repetition detection, proposal backlog.
4. **Limited relevant memory retrieval and archive window**:
   - A bounded set of recent artifacts/ideas and archive entries used for selection.
5. **Clear decision summaries and audit trace**:
   - `creative_session.decision_summary` and `deliberation_trace` rows.

This canon explicitly **rejects** the idea that “more context is always better”:

- Too many weak signals lead to noise, inconsistent behavior, latency, and hard‑to‑debug decisions.
- The goal is a **small number of strong steering variables**, not an ever‑growing context blob.

**Design guidance (implementation‑defined numbers):**

- A **small** set of persistent steering scores (≈ 5–15).
- A **short** active tension/priorities list.
- A **limited** memory/archive retrieval window (e.g. recent N items, not entire history).
- **Concise** decision outputs:
  - Decision summaries short enough to be read and reasoned about.
  - Deliberation traces that surface the key observations, evidence, and hypotheses, not everything.

The exact numeric thresholds, decay windows, and weighting formulas are **tunable heuristics**, not constitutional.

---

### 9. Tunable heuristics vs constitutional boundaries

This canon **locks**:

- **Authority boundaries**:
  - Inner vs middle vs outer zones.
  - Which actions are autonomous vs proposal‑only vs human‑gated vs privileged.
  - The fact that public identity changes must pass through governed routes and are audited.
- **Audit expectations**:
  - Governed changes (identity, avatar, habitat, system) must write `change_record`.
  - Artifact approval and publication must write their respective audit tables.
  - Reasoning must remain legible through deliberation trace and decision_summary.
- **Staging vs public distinction**:
  - Staging is sandbox; public identity is ratified.
  - There must be no silent escape hatches from staging into public surfaces.
- **Prohibition on silent public mutation**:
  - The Twin may not silently mutate identity, public habitat, avatar, approval, or publication state without going through governed paths.
- **Proposal‑first governance for public‑facing identity changes**:
  - For avatar and name, the canonical path is: Twin proposes → Harvey approves → change_record is written.
- **Deliberation trace role**:
  - It is a reasoning audit, not an action authority.

This canon **explicitly keeps tunable**:

- Drive weights and mode selection formulas.
- Archive return weighting and decay.
- Medium derivation thresholds and randomness.
- Proposal eligibility thresholds and caps.
- Confidence scoring and narrative summarization.
- Any future steering signals and derived scores.

Changing these heuristics **does not** require a canon change, as long as:

- Authority boundaries and audit guarantees remain intact.
- The number and nature of steering signals remain **bounded and inspectable**.

---

### 10. Audit and legibility requirements

To keep the Twin governable:

- **Every governed mutation** (identity, avatar, habitat, system) must:
  - Flow through an authenticated route.
  - Be covered by the appropriate FSM (where relevant).
  - Write an audit row (`change_record`, `approval_record`, or `publication_record`).
- **Every creative session** that writes artifacts must:
  - Emit a **deliberation_trace** row.
  - Update `creative_session.trace` and `decision_summary`.
- **Decisions must be inspectable**:
  - Which evidence and IDs influenced them (`evidence_checked_json`).
  - What tensions were active.
  - What alternatives were considered and rejected.
  - What action was chosen and with what confidence.

Deliberation trace is **not** a governance bypass:

- It does not itself mutate identity, habitat, avatar, or proposals.
- It records *why* decisions were made, not *what* was applied.

---

### 11. Prohibited autonomous actions

Under canon v2, the Twin **must not autonomously**:

- Change **identity fields**:
  - `name`, `name_status`, `naming_readiness_*`, `embodiment_direction`, `habitat_direction`, `active_avatar_artifact_id`, or similar.
- Change **public habitat content**:
  - Any row in `public_habitat_content`.
- Change **artifact governance state**:
  - `current_approval_state`, `current_publication_state`, or insert `approval_record` / `publication_record`.
- Call **approval or publish routes** on its own:
  - `/api/artifacts/[id]/approve`, `/api/artifacts/[id]/publish`, `/api/proposals/[id]/approve`, `/api/proposals/[id]/unpublish`, `/api/proposals/[id]` (PATCH).
- Mutate **system/workflow configuration** or **runtime_config** without an authenticated human route.
- Use deliberation trace or session trace as a hidden channel to trigger side effects.

**Nuance — proposal archiving:**

- The current implementation allows the runner to **archive older habitat layout proposals** directly.
- This is treated in this canon as:
  - **Implementation‑defined** and **narrow**: it affects only proposal state, not public identity.
  - **Acceptable** only if:
    - It remains limited to housekeeping (archiving superseded proposals).
    - It does not bypass human gates for identity, avatar, or habitat.
  - Future work MAY:
    - Move this under FSM guard and/or human control, or
    - Explicitly document it as an allowed autonomous housekeeping action with stronger constraints.

Any extension that would give the Twin direct control over new public‑facing or system‑level fields must be:

- Introduced via proposals and governed APIs, or
- Explicitly carved out in this canon as an exception with strong audit.

---

### 12. Reserved future authority

The following capabilities are **reserved** for future versions and are **not** currently implemented:

- **ExecutionMode semantics**:
  - Today, `executionMode` is always `"auto"` and `humanGateReason` is null.
  - Future canon may define:
    - `"proposal_only"` sessions (may propose but not persist governed changes).
    - `"human_required"` sessions (must wait for explicit operator input).
- **Richer staging application powers**:
  - Explicit staging identity / staging habitat representations.
  - Controlled auto‑apply to staging surfaces under caps and with audit.
- **Proposal‑driven system/UI changes**:
  - The Twin proposing and, under constraints, applying changes to UI or workflows.
  - Requires new governance rails and explicit audit semantics.
- **Stronger self‑review loops**:
  - Multi‑step deliberation cycles.
  - Structured “stop” or “ask human” decisions based on `executionMode`.
- **Advanced memory / ontology / identity shaping**:
  - Longer‑term personality, values, and relational models.
  - Domain ontologies for projects and threads.

Any implementation in these areas must:

- Respect the three‑zone authority model.
- Preserve audit and legibility requirements.
- Keep steering heuristics bounded and inspectable.

---

### 13. Exceptions and legacy paths

To avoid polluting the main model, legacy or exceptional paths live here:

- **Legacy `approve` action for proposals**:
  - `action = "approve"` in POST `/api/proposals/[id]/approve` sets `proposal_state = "approved"` where the FSM allows it.
  - This is a Harvey override path kept for backwards compatibility and should be used sparingly.

- **Identity PATCH overrides**:
  - `PATCH /api/identity` can change identity fields without an explicit proposal record.
  - This is a privileged manual override and must always:
    - Be authenticated.
    - Remain audit‑tracked via `change_record`.

- **`approve_publication` alias**:
  - The approve route accepts both `"approve_for_publication"` and `"approve_publication"` for some actions.
  - This alias is considered **implementation‑defined**; callers should prefer `approve_for_publication`.

Any other exceptional paths should be:

- Documented here when introduced.
- Kept minimal and highly auditable.

---

### 14. Summary table

| Decision / Action | Autonomous (inner) | Autonomous in staging only | Proposal‑only (Twin creates) | Human‑gated | Privileged / manual override | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Session mode selection | ✔️ | n/a | n/a | ✖️ | ✖️ | Implemented via creative state + backlog. |
| Drive selection | ✔️ | n/a | n/a | ✖️ | ✖️ | Implemented. |
| Focus selection (project/thread/idea, archive return) | ✔️ | n/a | n/a | ✖️ | ✖️ | Implemented; archive weighting tunable. |
| Medium derivation | ✔️ | n/a | n/a | ✖️ | ✖️ | Implemented; heuristics tunable. |
| Artifact generation, critique, evaluation | ✔️ | n/a | n/a | ✖️ | ✖️ | Implemented. |
| Creative state snapshot, memory, recurrence, archive_entry (from critique) | ✔️ | n/a | n/a | ✖️ | ✖️ | Implemented; audited via data tables. |
| Habitat layout proposal creation / refresh | ✖️ | (intended) | ✔️ | ✖️ (for creation) | ✖️ | Implemented as proposal creation; application is human‑gated. |
| Avatar candidate proposal creation | ✖️ | (intended) | ✔️ | ✖️ (for creation) | ✖️ | Implemented as proposal creation. |
| Proposal state transitions | ✖️ | ✖️ | ✖️ | ✔️ | ✖️ | Enforced by proposal FSM via PATCH/approve routes. |
| Identity name update via proposal | ✖️ | ✖️ | ✖️ | ✔️ | ✖️ | Implemented via `apply_name` + change_record. |
| Embodiment / avatar direction update via proposal | ✖️ | ✖️ | ✖️ | ✔️ | ✖️ | Implemented via `approve_avatar` + change_record. |
| Active avatar set via proposal | ✖️ | ✖️ | ✖️ | ✔️ | ✖️ | Implemented via `approve_for_publication` + change_record. |
| Identity PATCH (name / avatar / directions) | ✖️ | ✖️ | ✖️ | ✖️ | ✔️ | Privileged manual override; audited. |
| Public habitat publish via proposal | ✖️ | ✖️ | ✖️ | ✔️ | ✖️ | Implemented; validates references and writes change_record. |
| Public habitat clear | ✖️ | ✖️ | ✖️ | ✔️ | ✖️ | Implemented; always writes change_record. |
| Artifact approval state changes | ✖️ | ✖️ | ✖️ | ✔️ | ✖️ | Enforced by artifact FSM. |
| Artifact publication | ✖️ | ✖️ | ✖️ | ✔️ | ✖️ | Enforced by publish gate; audited. |
| System/workflow changes via proposals | ✖️ | ✖️ | ✔️ | ✔️ (for apply) | ✖️ | Proposal lanes exist; application audited with change_record. |
| Direct system/runtime config changes | ✖️ | ✖️ | ✖️ | ✖️ | ✔️ | Implemented via config routes; audit coverage is implementation‑defined. |
| Proposal housekeeping (auto‑archive older habitat proposals) | ✔️ (narrow, housekeeping) | n/a | n/a | ✖️ | ✖️ | Implemented; considered implementation‑defined and subject to future tightening. |

