# Canon Wiring Implementation Memo — Agent-9 Architecture Builder

**Context:** First canon starter pack is in place (`canon/core/*.json`, `canon/governance/*.json`). This memo describes how to wire the runtime, schemas, and UI around the canon layer so the runtime obeys canon as the constitutional source of truth.

---

## Executive Summary

The repo currently has **hardcoded Twin ontology**: lanes are `surface | medium | system`, lane classification is driven by Twin roles (`habitat_layout`, `avatar_candidate`, `extension`), proposal creation blocks the **runner** from the system lane only, and the review UI assumes three lanes with habitat/avatar/extension copy. The new canon introduces **five lanes** (build, system, canon, audit, promotion), **proposal types** with `primary_lane` and build-eligibility flags, **agent registry** with lane_permissions and allowed/restricted_actions, and **governance/block/promotion** rules in JSON.

**Strategy:** Add a **canon loader layer** (server-only, typed, cached) that reads the seven JSON files. Then **replace** the current proposal-governance lane classification and create-checks with canon-driven logic, **replace** lane identity and UI copy with canon lane_map, **replace** proposal-type and build-eligibility assumptions with proposal_types.json, and **replace** actor authority checks with agent_registry.json. Do **not** try to keep both ontologies in parallel; treat canon as source of truth and migrate call sites in a clear sequence. The current proposal **state** FSM (pending_review → approved_for_staging → staged → …) can remain for a first phase and be mapped to canon lifecycle later, or you can introduce a compatibility shim (canon status → existing proposal_state) so promotion and blocking still use canon rules.

**Risks:** DB enum `approval_lane` is `artifact | surface | system | medium`. Canon lanes are `build_lane`, `system_lane`, `canon_lane`, `audit_lane`, `promotion_lane`. You will need either a DB migration to extend/remap the enum or a **storage mapping** (store canon lane_id in a text column, keep enum for backward compatibility until full migration). Recommendation: add `lane_id` (TEXT) to proposal_record if not present, populated from canon; migrate enum in a later step.

---

## 1. Best First Integration Points

| Integration point | Current location | What to do |
|-------------------|------------------|------------|
| **Proposal creation — lane assignment** | `apps/studio/lib/proposal-governance.ts` → `classifyProposalLane()` | Replace hardcoded `systemRoles` / `mediumRoles` / `surfaceRoles` with lookup from canon: resolve `proposal_type` (or `proposal_role`) against `canon/core/proposal_types.json` → `primary_lane`; optionally validate lane exists in `lane_map.json`. |
| **Proposal creation — agent authority** | `proposal-governance.ts` → `canCreateProposal(lane, actor)` | Replace `runner`-vs-human check with canon: load `agent_registry.json`, resolve actor to an agent (e.g. `agent_9`, `builder_agent`, `human`), check `lane_permissions` includes the proposal’s lane and `allowed_actions` includes `create_proposal` (or the specific action); enforce `restricted_actions` (e.g. no `create_proposal` for system_lane by builder only if canon says so). |
| **Proposal validation** | Before insert in session-runner, create-proposal API, and any “create proposal” path | Validate `proposal_type` is in `proposal_types.json`; validate `primary_lane` from canon matches resolved lane; validate required fields from `proposal_types[].required_fields` if you have a strict payload. |
| **Lane assignment / governance routing** | Same `classifyProposalLane`; also APIs that filter by `lane_type` | All lane identity comes from canon: `lane_map.json` defines lane_id and description; use `proposal_types[].primary_lane` to set lane on new proposals. Route “which lane does this go to?” entirely from canon. |
| **Patch/build eligibility** | Not implemented yet; session-runner today only creates proposals | When you add patch/build flow: before “accept for build” or “send to builder,” check `proposal_types[].auto_build_allowed` and `requires_human_prebuild_approval` from canon; block or require human step accordingly. |
| **Audit/promotion blocking** | Today: `evaluateGovernanceGate` in proposal-governance; approve route and promote path | Add checks against `canon/governance/block_conditions.json`: before promotion, ensure no active block_condition applies (e.g. `missing_rollback_notes`, `unresolved_severe_audit_finding`). Use `promotion_rules.json` for “what must be true to allow promote” (e.g. `human_approval_recorded`, `promotion_audit_completed`). |
| **Agent authority checks** | `getProposalAuthority("runner" | "http_user" | "reviewer")` → used in `canCreateProposal` | Map HTTP/session context to `agent_id` (e.g. session run by Agent-9 → `agent_9`; API call by user → treat as human or a dedicated “human” agent if you add one). Then check `agent_registry.agents[]` for that agent’s `lane_permissions` and `allowed_actions` / `restricted_actions`. |
| **Review UI / Studio surfaces** | `apps/studio/app/review/page.tsx`, `review/surface/page.tsx`, `review/medium/page.tsx`, `review/system/page.tsx`; staging read model bucket labels | Review hub: load `lane_map.json` (or a GET that returns canon lanes) and render one section per canon lane with label and description from canon; count proposals per lane_id. Child review pages: filter by canon lane_id; show labels/descriptions from canon. Replace hardcoded “Surface / Medium / System” and “habitat/avatar/extension” copy. |

---

## 2. Files / Modules to Refactor First

| Priority | File / module | Why |
|----------|----------------|------|
| 1 | **canon loader** (new) | Nothing can depend on canon until a loader exists. Add `packages/canon` or `apps/studio/lib/canon/` with loader + types. |
| 2 | **`apps/studio/lib/proposal-governance.ts`** | Contains `LaneType = "surface" \| "medium" \| "system"`, `classifyProposalLane()` (hardcoded role sets), and `canCreateProposal(lane, actor)`. This is the main switchboard for lane and authority. Refactor to: (a) derive lane from canon (proposal_types primary_lane), (b) derive agent permissions from agent_registry, (c) keep transition/promotion guards but optionally feed allowed states from canon later. |
| 3 | **`apps/studio/lib/governance-rules.ts`** | Contains `PROPOSAL_STATE_TRANSITIONS` and `getNextLegalProposalActions`. For v1 you can keep this as-is and keep using Twin proposal_state; add a thin layer that checks block_conditions and promotion_rules from canon when deciding if a transition or promote is allowed. |
| 4 | **`apps/studio/lib/session-runner.ts`** (manageProposals) | All `proposal_role` and `lane_type` are Twin-specific (habitat_layout, avatar_candidate, extension, surface/medium). Refactor so: proposal_type (and thus primary_lane) comes from canon; agent_id for the runner is `agent_9`; create check uses canon agent permissions. Stop emitting Twin-only roles; emit proposal_type from canon (e.g. system_change, schema_change) and let classifyProposalLane (canon-driven) set lane. |
| 5 | **`apps/studio/app/review/page.tsx`** | Hardcoded three lanes and copy. Replace with: fetch canon lanes (lane_map) and optionally counts per lane; render sections from canon; links to `/review/[lane_id]` or keep current paths and map lane_id → route. |
| 6 | **`apps/studio/app/api/proposals/route.ts`** and **`[id]/route.ts`** | Query and PATCH use `lane_type` and `proposal_state`. Keep proposal_state for now; for lane_type, either add a stored `lane_id` from canon or keep mapping canon lane → existing enum in API (e.g. build_lane → surface for backward compat if you delay schema change). |
| 7 | **`apps/studio/app/api/artifacts/[id]/create-proposal/route.ts`** | Accepts `lane_type`, `proposal_role`; calls `classifyProposalLane` and `canCreateProposal`. Change to accept `proposal_type` (canon) and optionally `lane_type` override; classification and create check use canon. |
| 8 | **`apps/studio/lib/staging-read-model.ts`** | Buckets by `lane_type` and `proposal_role`. Update to bucket by canon lane_id (and optionally proposal_type); display labels from canon. |
| 9 | **`apps/studio/app/api/proposals/counts/route.ts`** | Twin-specific: identity_name, public_habitat_proposal, avatar_candidate. Replace with counts per canon lane_id (and optionally per proposal_type). |
| 10 | **`apps/studio/app/api/staging/proposals/route.ts`** | Filters `lane_type === "surface"`. With canon, “staging” may still map to a subset of lanes (e.g. build_lane); use canon to decide which lanes are stageable. |

**Later / optional:** `governance-rules.ts` PROPOSAL_STATE_TRANSITIONS could be driven by a canon lifecycle file (e.g. proposal_lifecycle.json) with a mapping to existing DB states; block_conditions and promotion_rules used in approve and promote routes; stop-limits.ts replaced or extended with per–proposal_type caps from canon or policy.

---

## 3. First Implementation Sequence

Realistic order of operations:

1. **Add canon directory and files**  
   Ensure the seven files exist under `canon/core/` and `canon/governance/` (system_ontology, agent_registry, proposal_types, lane_map, governance_rules, promotion_rules, block_conditions). If they live in another repo or path, document the path and make the loader accept a root path (env or config).

2. **Add canon loader + types**  
   - Create a small package or `apps/studio/lib/canon/` with:  
     - Typed interfaces for each JSON shape (or Zod schemas).  
     - `loadCanon(rootPath?)` that reads the seven files, parses JSON, validates (Zod or manual), and returns a single canon object.  
     - Cache in memory (singleton or per-request in server components/route handlers).  
   - No client-side import of canon; loader runs only on server (Node).  
   - Export: `getCanon()`, `getProposalTypes()`, `getLaneMap()`, `getAgentRegistry()`, `getGovernanceRules()`, `getPromotionRules()`, `getBlockConditions()` for convenience.

3. **Replace hardcoded proposal types and lanes in code**  
   - In proposal-governance: remove hardcoded `LaneType` union; use `lane_id` from lane_map (string).  
   - Implement `classifyProposalLaneFromCanon(proposal_type: string): { lane_id: string }`: lookup proposal_type in proposal_types.json, return primary_lane.  
   - Keep backward compatibility: if proposal_type is missing or unknown, fall back to a default lane from canon (e.g. build_lane) or fail validation.

4. **Replace lane routing assumptions**  
   - Every place that branches on `lane_type === "surface" | "medium" | "system"` should instead branch on canon lane_id (build_lane, system_lane, canon_lane, audit_lane, promotion_lane).  
   - Add a small mapping or convention: e.g. “stageable” lanes = those in promotion_rules or a list in canon; “promotion lane” is the lane for promotion-ready packages.  
   - DB: either add `lane_id` (TEXT) to proposal_record and persist canon lane_id, or keep storing current enum and maintain a map canon_lane_id → enum for reads/writes until you migrate the enum.

5. **Wire agent authority to agent_registry**  
   - Resolve “who is acting?” to an agent_id: cron/session run → `agent_9`; API with auth user → human (or a “human” agent entry in registry); future builder/audit → `builder_agent` / `risk_audit_agent`.  
   - In `canCreateProposal(lane_id, agent_id)` (or equivalent): load agent_registry, find agent by agent_id, check `lane_permissions` includes lane_id and `allowed_actions` includes create_proposal (or the right action); if `restricted_actions` includes it, block.  
   - Remove the single “runner cannot create system” special case; replace with “agent_9 can create in build/system/canon per registry; builder_agent only in build_lane; human can be given broad permissions.”

6. **Replace governance checks**  
   - Before any “approve” or “promote” action: load block_conditions and promotion_rules; run a small function that checks current proposal/patch state against these (e.g. rollback_notes_present, no unresolved_severe_audit_finding).  
   - Keep using existing FSM for proposal_state transitions; add an extra “canPromote(canon)” check that consults promotion_requirements and block_conditions.

7. **Expose canon to UI**  
   - Add GET `/api/canon/lanes` (or `/api/canon`) that returns lane_map (and optionally proposal_types, or a minimal view).  
   - Review hub and review sub-pages call this API or receive canon from a server component that calls getCanon().  
   - Replace hardcoded labels and descriptions with canon lane label/description.

8. **Patch/build eligibility (when you add patch flow)**  
   - When implementing “accept for build” or “send to builder”: read proposal_types[].auto_build_allowed and requires_human_prebuild_approval; gate accordingly.

9. **Optional: proposal lifecycle from canon**  
   - If you introduce proposal_lifecycle.json (drafted, submitted, classified, accepted_for_build, …), add a mapping from canon status to current proposal_state so existing DB and UI still work while you migrate.

10. **Tests and cleanup**  
    - Update tests that assert on lane_type "surface" | "medium" | "system" to use canon lane_ids.  
    - Remove or deprecate Twin-only roles (habitat_layout, avatar_candidate, extension) from production code paths once canon-driven proposal_type and lane are the only source.

---

## 4. Runtime Architecture for Canon Loading

**Recommended: server-only singleton with cached read.**

- **Where:** `packages/canon` (new) or `apps/studio/lib/canon/`. Prefer a package if multiple apps (e.g. studio, a future builder service) need canon; otherwise `lib/canon` is enough.
- **Loader:**  
  - `loadCanon(root?: string)`: `root` defaults to `process.cwd()` or `CANON_ROOT` env; reads `canon/core/*.json` and `canon/governance/*.json` from disk.  
  - Returns a single object: `{ systemOntology, agentRegistry, proposalTypes, laneMap, governanceRules, promotionRules, blockConditions }`.  
  - Use **Zod** to parse and validate each file so invalid JSON or shape errors fail fast at load time.
- **Caching:** In-memory cache after first successful load (e.g. `let cached: Canon | null = null`). Optional: file watcher or TTL to reload when files change (dev); in production, restart or explicit reload is enough for v1.
- **Typed API:** Export TypeScript types inferred from Zod schemas. Export helpers: `getProposalType(typeId)`, `getLane(laneId)`, `getAgent(agentId)`, `getBlockConditions()`, `getPromotionRequirements()`.
- **Server-only:** Do not import the loader or raw canon in client components. Only API routes or server components should call `getCanon()`; pass derived data (e.g. lane list, labels) to client via props or API.
- **Why not DB-first:** Canon is file-based so it’s versionable, diffable, and reviewable in git. DB can mirror it later if you need runtime edits; for v1, files are the source of truth.

**Zod:** Use Zod schemas for each JSON shape (e.g. `ProposalTypeSchema`, `LaneSchema`, `AgentRegistrySchema`). Parse with `.safeParse()`; on failure log and throw so the app doesn’t start with bad canon.

**Singleton:** One `getCanon()` that returns the cached object; no need for a dependency-injection container for v1.

---

## 5. UI Surfaces to Update

| Surface | Change |
|---------|--------|
| **Review hub** (`app/review/page.tsx`) | Load lane_map from canon (API or server getCanon()). Render one section per lane with `lane.label`, `lane.description`; count proposals by lane_id; link to `/review/[lane_id]` or map to existing /review/surface, /medium, /system until routes are renamed. |
| **Review lane pages** (`review/surface/page.tsx`, `review/medium/page.tsx`, `review/system/page.tsx`) | Replace hardcoded titles and copy with canon lane label/description; filter proposals by canon lane_id (or mapped value). Consider consolidating to one dynamic route `/review/[laneId]` that reads canon for label/description. |
| **Staging / proposal lists** | Any list that shows “Surface / Medium / System” or “habitat / avatar / extension” should show canon lane labels and proposal_type labels from canon. |
| **Proposal create/detail** | When creating a proposal, show proposal_type dropdown or selector from canon (proposal_types.json); show primary_lane from canon; show allowed actions from getNextLegalProposalActions (can stay FSM-based) or future canon lifecycle. |
| **Proposal counts API** | `/api/proposals/counts` should return counts per canon lane_id (and optionally per proposal_type) so the hub can display them. |

---

## 6. Known Conflicts with Old Twin Assumptions

| Conflict | Where | Resolution |
|----------|--------|------------|
| **Lane set** | DB enum `approval_lane`: artifact, surface, system, medium. Canon: build_lane, system_lane, canon_lane, audit_lane, promotion_lane. | Add `lane_id` TEXT to proposal_record and use canon lane_id; keep enum for backward compat and map in code, or migrate enum (breaking). |
| **Runner forbidden from system** | `canCreateProposal("system", "runner")` returns block. | Remove; use agent_registry: agent_9 has system_lane in lane_permissions and create_proposal in allowed_actions, so Agent-9 can create system proposals. |
| **Only human-created system proposals** | Docs and session-runner never create lane_type system. | Canon explicitly allows Agent-9 to create system proposals; refactor manageProposals to allow proposal_types whose primary_lane is system_lane when actor is agent_9. |
| **Habitat/avatar/extension roles** | classifyProposalLane maps habitat_layout → surface, avatar_candidate → surface, extension → medium. | Drop; proposal_type (e.g. system_change, schema_change, new_agent) drives primary_lane via proposal_types.json. No more habitat_layout or avatar_candidate. |
| **Surface = stageable, non-surface = no staging** | proposal-governance and staging routes assume only “surface” can go to approved_for_staging / staged / published. | In canon, “stageable” is build (and maybe others); define which lane_ids can transition to staged/promoted from promotion_rules or lane_map; apply same FSM logic by lane_id. |
| **No generic patch engine** | Repo has no patch table or “build” step; only proposals and habitat merge. | Canon assumes proposals → patches → audit → promote. For first phase, you can wire proposal creation and lane/authority from canon without implementing patch yet; add patch and build eligibility when you build that flow. |
| **Creative ontology** | Session-runner and UI assume artifact, idea, idea_thread, creative state, habitat, avatar. | Canon says nothing about creative state or habitat. Do not try to map artifact to “patch”; keep proposal_record and proposal flow, and gradually introduce patch and snapshot semantics from canon while retiring Twin-only concepts in the proposal path. |
| **Hardcoded proposal_state list** | ALLOWED_PROPOSAL_STATES and PROPOSAL_STATE_TRANSITIONS in governance-rules. | Keep for v1; canon proposal_lifecycle has different statuses (drafted, submitted, classified, …). Either map canon status ↔ proposal_state in an adapter or migrate to canon lifecycle in a later phase. |
| **Stop-limits** | getMaxPendingHabitatLayoutProposals, getMaxPendingAvatarProposals, getMaxPendingExtensionProposals. | Replace with per–proposal_type or per-lane caps from canon or a policy file when you’re ready; or leave env-based caps but keyed by proposal_type/lane_id. |

---

## 7. Suggested First 10 Implementation Steps

1. **Create canon directory** in repo root with the seven JSON files (copy from doc/json_starterpack or equivalent). Add a short README in `canon/` describing each file and that they are the constitutional source of truth.

2. **Add `packages/canon` (or `apps/studio/lib/canon`)** with Zod schemas for each JSON file, a single `loadCanon(root?)` that reads and parses all seven, in-memory cache, and exports `getCanon()`, `getProposalTypes()`, `getLaneMap()`, `getAgentRegistry()`, `getGovernanceRules()`, `getPromotionRules()`, `getBlockConditions()`.

3. **Implement `classifyProposalLaneFromCanon(proposal_type: string)`** in proposal-governance (or in canon package) that returns `primary_lane` from proposal_types.json; if proposal_type is missing, return a default or throw. No change to DB yet.

4. **Refactor `classifyProposalLane()` in proposal-governance** to use canon: accept `proposal_type` (and optionally requested_lane); resolve lane via classifyProposalLaneFromCanon; keep returning a shape compatible with current callers (lane_id instead of lane_type). Update type LaneType to be string (canon lane_id) or a union of canon lane ids.

5. **Refactor `canCreateProposal(lane_id, agent_id)`** to load agent_registry, look up agent_id, check lane_permissions and allowed_actions/restricted_actions; remove the special-case “runner cannot create system.” Map session/API context to agent_id (e.g. runner → agent_9, HTTP user → human).

6. **Update session-runner manageProposals** to use canon proposal_type and canon-driven classification: e.g. when creating a “concept” or “system” proposal, set proposal_type from canon (system_change, schema_change, refactor_plan, etc.) and let classifyProposalLaneFromCanon set the lane; stop using habitat_layout, avatar_candidate, extension as proposal_role for new logic. Persist lane_id (if column exists) or keep mapping canon lane → current enum for DB write.

7. **Add GET `/api/canon/lanes`** that returns lane_map (label, description, lane_id) from getLaneMap(). Use in review hub.

8. **Refactor review hub** to fetch canon lanes (from API or server getCanon()), render one section per lane with canon label and description, and count proposals by lane_id (add query param or new counts API by lane_id).

9. **Add promotion/block check** before promote (and optionally before approve_for_publication): load block_conditions and promotion_rules, implement `canPromote(proposal, context)` that checks e.g. rollback_notes_present, no unresolved_severe_audit_finding, human_approval_recorded; call it from promote route and optionally from approve route.

10. **DB migration (optional for step 10):** Add `lane_id` TEXT to proposal_record, backfill from current lane_type (map surface→build_lane, medium→build_lane or keep, system→system_lane); then have new proposals written with canon lane_id and readers prefer lane_id when present.

---

## Summary Table

| Area | Source of truth (after wiring) | Current state |
|------|--------------------------------|---------------|
| Proposal types | canon/core/proposal_types.json | Hardcoded habitat_layout, avatar_candidate, extension; no system_change, schema_change, etc. |
| Lanes | canon/core/lane_map.json | approval_lane enum + LaneType surface \| medium \| system |
| Agent permissions | canon/core/agent_registry.json | canCreateProposal(lane, "runner") blocks system only |
| Governance rules | canon/governance/governance_rules.json | Not used in code |
| Promotion rules | canon/governance/promotion_rules.json | Not used; promote is human-only by convention |
| Block conditions | canon/governance/block_conditions.json | Not used |
| Review UI labels | canon lane_map labels/descriptions | Hardcoded “Surface / Medium / System” and Twin copy |

Once the loader exists and the first refactors are done, the runtime will obey canon for proposal type, lane, and agent authority; then add block/promotion checks and UI from canon, and finally align lifecycle and DB with canon as needed.
