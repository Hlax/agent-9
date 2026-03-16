# Agent-9 Pivot — Full Repo Audit

**Context:** Repo is pivoting from Twin_V1 to an Agent-9 architecture-builder system. Canon is the constitutional source of truth. This audit classifies every important file/module into **Keep**, **Keep but translate**, **Quarantine**, or **Delete later**, with minimal-core primitive mapping and canon-native replacement guidance.

**Principles:** No optimization for preserving Twin terminology. No shallow word replacement. Distinguish reusable mechanics from obsolete domain assumptions. Prefer semantic cleanup over cosmetic renaming.

---

## 1. Executive Summary

- **Current state:** The codebase is a hybrid. Canon loader and proposal-governance lane/authority are partially wired (proposal_type → primary_lane, agent_registry for create). Session-runner, staging read model, review UI, proposal APIs, and stop-limits still encode **Twin ontology**: lanes = surface/medium/system, roles = habitat_layout / avatar_candidate / extension, surface-only staging/promotion, and UI copy ("Twin Studio", "Live Twin", "habitat", "avatar").
- **Blockers:** The pivot is blocked until (1) **session-runner** emits canon `proposal_type` and uses canon-driven classification only; (2) **proposal-governance** removes surface-only staging/promotion and uses canon stageable lanes + block/promotion rules; (3) **staging-read-model** and **review hub** are driven by canon lane_map; (4) **proposal counts API** and **staging proposals API** stop hardcoding surface/target_type; (5) **stop-limits** are keyed by proposal_type/lane_id from canon (or policy), not by Twin role names.
- **Reusable mechanics:** Runtime orchestration (session-runner flow), artifact approval FSM, proposal state FSM, creative state evolution, return-mode scoring, deliberation/trace, runtime state API, and the canon loader/schemas/compat are **reusable**. They need translation of **semantics** (what is a "proposal", what is a "lane", who is the "runner") and removal of Twin-only branches, not just renames.
- **Obsolete domain assumptions:** Twin-specific roles (habitat_layout, avatar_candidate, extension), "surface = only stageable", "runner cannot create system", counts by identity_name/public_habitat_proposal/avatar_candidate, and UI copy that refers to "Twin", "habitat", "avatar" as product concepts. These should be replaced by canon lane_id, proposal_type, and Agent-9 / lane labels.
- **Do not rename blindly:** Files that encode **wrong semantics** (not just wrong words) are marked below. Renaming "habitat_layout" to "layout_proposal" without switching to canon proposal_type and primary_lane would leave the system inconsistent. Same for "Surface lane" → "Build lane" in UI without driving the lane list and counts from canon.

---

## 2. High-Priority Files Blocking the Pivot

| File | Why it blocks |
|------|----------------|
| **apps/studio/lib/session-runner.ts** | Creates proposals with hardcoded `proposal_role`: habitat_layout, avatar_candidate, extension. Does not set canon `proposal_type`; lane comes from legacy classifyProposalLane(role). Runner is the only writer of these proposals; until it emits proposal_type and uses canon-only classification, the system stays Twin-bound. |
| **apps/studio/lib/proposal-governance.ts** | Still has surface-only staging/promotion (canTransitionProposalState blocks non-surface for approved_for_staging/staged/approved_for_publication/published). Legacy role sets (surfaceRoles, mediumRoles, systemRoles) used when proposal_type is missing. Must drive stageable lanes and promotion from canon (promotion_rules, block_conditions, lane_map). |
| **apps/studio/lib/staging-read-model.ts** | Buckets are Twin buckets: habitat, artifacts, critiques, extensions, system. classifyLaneBucket uses lane_type + proposal_role + target_type (e.g. "extension" → extensions). Must bucket by canon lane_id and optionally proposal_type; labels from lane_map. |
| **apps/studio/app/review/page.tsx** | Hardcoded three lanes (Surface / Medium / System), hardcoded copy and counts by lane_type. Must fetch canon lane_map, count by lane_id, render sections from canon with canon labels. |
| **apps/studio/app/api/proposals/counts/route.ts** | Returns Twin-specific counts: identity_name, public_habitat_proposal, avatar_candidate. Blocks any UI that wants canon-based counts. Must return counts per canon lane_id (and optionally per proposal_type). |
| **apps/studio/app/api/staging/proposals/route.ts** | Filters `lane_type === "surface"`. With canon, stageable lanes come from promotion_rules / lane_map. Must use canon to decide which proposals are "for staging". |
| **apps/studio/lib/stop-limits.ts** | getMaxPendingHabitatLayoutProposals, getMaxPendingAvatarProposals, getMaxPendingExtensionProposals are Twin-role-based. Caps should be per proposal_type or per canon lane_id (from canon or policy file). |
| **apps/studio/lib/governance-rules.ts** | FSM is reusable; but promotion/staging eligibility is currently implied by "surface" in proposal-governance. Once proposal-governance uses canon stageable lanes, governance-rules can stay; if canon gets a proposal_lifecycle, consider mapping canon status ↔ proposal_state here. |

---

## 3. Full Classification Table

For each significant file/module:

| File / module | Current purpose | Primitive | Classification | Why | Canon-native replacement | Blocks if unchanged? |
|---------------|-----------------|-----------|----------------|-----|---------------------------|------------------------|
| **apps/studio/lib/session-runner.ts** | Session orchestration: load state, mode/drive, focus, contexts, generation, critique, persist, manageProposals, trace, return-intelligence. | Runtime + Event/Proposal generation | **Translate** | Core flow is reusable; proposal creation is Twin-bound (habitat_layout, avatar_candidate, extension, no proposal_type). | Emit canon proposal_type per artifact path; call classifyProposalLane with proposal_type only; agent_id = agent_9; remove role-based branches; keep orchestration and trace. | **Yes** |
| **apps/studio/lib/proposal-governance.ts** | Lane classification (canon when proposal_type set, else legacy roles), actor authority (canon agent_registry), transition/promotion guards. | Governance | **Translate** | Already uses canon for lane and canCreateProposal; surface-only staging/promotion and legacy role sets must go. | Stageable lanes from canon (promotion_rules / lane_map); block_conditions/promotion_rules for promote/approve; remove surfaceRoles/mediumRoles/systemRoles; keep FSM wrapper. | **Yes** |
| **apps/studio/lib/governance-rules.ts** | Artifact approval FSM; proposal state FSM; isLegal*Transition, getNextLegalProposalActions. | Governance | **Keep** | Pure FSM; no Twin semantics. Optional: thin layer for block_conditions/promotion_rules or future canon lifecycle mapping. | None for v1; optionally feed allowed states from canon later. | No |
| **apps/studio/lib/staging-read-model.ts** | Read model: bucket proposals into habitat/artifacts/critiques/extensions/system; build StagingReviewModel for API/UI. | State (read model) | **Translate** | Buckets and classifyLaneBucket are Twin ontology. | Bucket by canon lane_id; labels/descriptions from lane_map; optional proposal_type grouping. | **Yes** |
| **apps/studio/lib/canon/loader.ts** | Load canon JSON from disk, Zod-validate, cache; getCanon, getProposalTypes, getLaneMap, getAgentRegistry, etc. | Other (canon infra) | **Keep** | Already the canon source; server-only. | None. | No |
| **apps/studio/lib/canon/schemas.ts** | Zod schemas for canon JSON. | Other (canon infra) | **Keep** | Required by loader. | None. | No |
| **apps/studio/lib/canon/compat.ts** | Map canon lane_id ↔ DB LaneType (surface/medium/system). | Other (canon infra) | **Keep** | Temporary shim until DB has lane_id; document as compat only. | Remove when proposal_record has lane_id and UI uses canon lanes only. | No |
| **apps/studio/lib/canon/index.ts** | Re-exports canon loader, compat, schemas. | Other (canon infra) | **Keep** | — | — | No |
| **apps/studio/app/review/page.tsx** | Review hub: three hardcoded lanes (Surface/Medium/System), counts by lane_type. | Governance (UI) | **Translate** | Lane set and copy are Twin. | Fetch lane_map (API or getCanon); count by lane_id; one section per canon lane with canon label/description; links by lane_id. | **Yes** |
| **apps/studio/app/review/surface/page.tsx** | Surface lane landing: links to habitat, avatar, name. | Governance (UI) | **Translate** | "Surface" and habitat/avatar/name are Twin. | Either dynamic /review/[laneId] with canon labels or keep routes but drive labels/copy from canon. | No (after hub fixed) |
| **apps/studio/app/review/surface/habitat/** | Habitat proposal list, live habitat pages, promotion. | Governance (UI) | **Translate** | "Habitat" is Twin product concept; surface lane. | Rename/concept to "build" or canon lane label; content remains "layout/public snapshot" semantics; drive from lane_id. | No |
| **apps/studio/app/review/surface/avatar/** | Avatar proposal list and review. | Governance (UI) | **Translate** | "Avatar" is Twin; surface lane. | Map to canon proposal_type/lane label (e.g. embodiment or build_lane subtype); same list filtered by proposal_type or lane. | No |
| **apps/studio/app/review/surface/name/page.tsx** | Name/identity proposal review. | Governance (UI) | **Translate** | Twin identity naming. | Either keep as one proposal_type under build/identity or fold into generic proposal list by proposal_type. | No |
| **apps/studio/app/review/medium/page.tsx** | Medium/extensions lane review. | Governance (UI) | **Translate** | "Medium" lane and "extensions" are Twin. | Canon lane label (e.g. audit_lane or capability); list by lane_id. | No |
| **apps/studio/app/review/system/page.tsx** | System lane review. | Governance (UI) | **Translate** | "System lane" copy is Twin. | Canon system_lane label/description; filter by lane_id. | No |
| **apps/studio/app/review/staging/page.tsx** | Staging review client; uses staging-read-model. | State + Governance (UI) | **Translate** | Depends on staging-read-model buckets (Twin). | After read model uses canon lanes, UI shows canon labels; "habitat" becomes e.g. build_lane staging. | **Yes** (via read model) |
| **apps/studio/app/review/staging/staging-review-client.tsx** | UI for staging buckets (habitat groups, artifacts, extensions, etc.). | State (UI) | **Translate** | Copy and bucket names are Twin. | Labels from canon; same structure keyed by lane_id. | No (after read model) |
| **apps/studio/app/review/artifacts/page.tsx** | Artifact list/review. | Governance (UI) | **Keep** | Artifact is generic. | Optional: link to proposals by artifact; no Twin-specific logic. | No |
| **apps/studio/app/review/proposals/[id]/page.tsx** | Single proposal detail. | Governance (UI) | **Translate** | May show Twin role/lane copy. | Show canon proposal_type and lane label. | No |
| **apps/studio/app/api/proposals/route.ts** | GET list (lane_type, target_type, etc.); POST create with classifyProposalLane, canCreateProposal. | Event/Proposal + Governance | **Translate** | POST already accepts proposal_type; GET filters by lane_type/target_type (Twin). | GET: support lane_id and proposal_type; POST: require proposal_type when from Agent-9; keep governance. | Partial |
| **apps/studio/app/api/proposals/[id]/route.ts** | Get/PATCH single proposal. | State | **Keep** | Generic CRUD. | Optional: validate PATCH with canon lifecycle/block. | No |
| **apps/studio/app/api/proposals/[id]/approve/route.ts** | Approve (transition) with canTransitionProposalState. | Governance | **Translate** | Uses proposal-governance; surface-only is in that module. | After proposal-governance uses canon, add block_conditions/promotion_rules check here if desired. | No (governance blocks) |
| **apps/studio/app/api/proposals/counts/route.ts** | Counts for layout: identity_name, public_habitat_proposal, avatar_candidate. | State | **Translate** | 100% Twin. | Return counts per canon lane_id (and optionally proposal_type). | **Yes** |
| **apps/studio/app/api/staging/proposals/route.ts** | List proposals for staging; filter lane_type === "surface". | State | **Translate** | Hardcoded surface. | Filter by canon stageable lane_id(s) from lane_map/promotion_rules. | **Yes** |
| **apps/studio/app/api/staging/review/route.ts** | GET staging review (getStagingReviewModel). | State | **Translate** | Returns Twin buckets. | After staging-read-model is canon-driven, no change here or minimal. | **Yes** (via read model) |
| **apps/studio/app/api/staging/proposal/action/route.ts** | Proposal state transition (staging). | Governance | **Keep** | Delegates to governance. | — | No |
| **apps/studio/app/api/staging/promote/route.ts** | Promote to public. | Governance | **Translate** | May assume surface; add canon block/promotion check. | Enforce block_conditions and promotion_rules from canon. | Partial |
| **apps/studio/app/api/artifacts/[id]/create-proposal/route.ts** | Create proposal from artifact; classifyProposalLane, canCreateProposal. | Event/Proposal + Governance | **Translate** | Accepts lane_type, proposal_role (Twin). | Accept proposal_type (canon); classification from canon only. | Partial |
| **packages/core/src/enums.ts** | artifact_medium, session_mode, creative_drive, initiated_by, approval_lane, etc. | State | **Keep** + **Translate** | initiated_by has "twin"; approval_lane is artifact|surface|system (no medium in list—check DB). Reusable enums; rename initiated_by "twin" → "agent" or "agent_9" when used in API. | Add lane_id in DB; keep approval_lane for compat; map initiated_by to agent_id where needed. | No |
| **packages/evaluation/src/creative-state.ts** | Creative state fields, updateCreativeState, computeSessionMode, computeDriveWeights, selectDrive. | State + Feedback loop | **Keep** | Domain is "creative state" (canon: creative_state_model); no Twin in logic. | Optional: rename "avatar_alignment" if canon renames that dimension; otherwise keep. | No |
| **apps/studio/lib/creative-state-load.ts** | Load latest creative_state_snapshot for session. | State | **Keep** | — | — | No |
| **apps/studio/lib/return-intelligence.ts** | Score archive candidates for return mode; tension/recurrence/critique/age. | Feedback loop | **Keep** | Mechanics are generic; "identity" in tension is product wording. | Optional: rename tension kinds to canon terms if canon defines them. | No |
| **apps/studio/lib/habitat-payload.ts** | Habitat V2 payload schema and validator (buildMinimalHabitatPayloadFromConcept, etc.). | Event/Proposal generation | **Translate** | "Habitat" is Twin product name; schema is for layout/public content. | Keep schema; treat as "layout payload" or "build_lane payload"; rename module to layout-payload or keep and document as legacy name for payload shape. | No |
| **apps/studio/lib/proposal-eligibility.ts** | Concept eligibility: critique outcome, alignment/fertility/pull thresholds. | Event/Proposal generation | **Keep** | Reusable thresholds; concept is one artifact type. | Optional: drive thresholds from canon or config. | No |
| **apps/studio/lib/stop-limits.ts** | Caps: habitat_layout, avatar, extension pending; sessions per hour; tokens; repetition. | Governance | **Translate** | Role-based caps are Twin. | Per proposal_type or per lane_id caps from canon or policy; keep session/token/repetition limits. | **Yes** |
| **apps/studio/lib/twin-seed-config.ts** | Twin seed identity config. | State | **Quarantine** | Twin-named; may be used for "identity" bootstrap. | Replace with agent-9 or identity-seed config; rename. | No |
| **apps/studio/lib/deliberation-trace.ts** | Write deliberation trace. | Runtime / Observability | **Keep** | — | — | No |
| **apps/studio/lib/trajectory-review.ts** | Derive trajectory review (narrative_state, action_kind, etc.). | Runtime / Observability | **Keep** | — | — | No |
| **apps/studio/lib/runtime-state-api.ts** | getRuntimeStatePayload, trace, deliberation, continuity. | Runtime | **Keep** | — | Optional: expose canon lane list. | No |
| **apps/studio/lib/governance-rules.ts** | (see above) | Governance | **Keep** | — | — | No |
| **apps/studio/lib/proposal-families.ts** | Concept families for grouping. | State | **Keep** | Generic. | — | No |
| **apps/studio/lib/proposal-relationship.ts** | Proposal relationship evaluation. | State | **Keep** | Generic. | — | No |
| **apps/studio/lib/publish-gate.ts** | Publish gating. | Governance | **Keep** | — | Optional: integrate block_conditions. | No |
| **apps/studio/app/page.tsx** | Studio home: "Twin Studio", pipeline copy, links (Live Twin, etc.). | Other (UI) | **Translate** | Twin branding and copy. | "Agent-9 Studio" or product name; "Live" view label from canon/config. | No |
| **apps/studio/app/live-twin/page.tsx** | Live Twin — read-only public view. | Other (UI) | **Translate** | "Live Twin" is Twin. | "Live" or "Public view"; data stays habitat_snapshot / public content. | No |
| **apps/studio/app/identity/page.tsx** | Twin identity page; naming, habitat_direction. | State (UI) | **Translate** | "Twin" copy; habitat_direction is Twin. | Identity/embodiment page; keep semantics; change copy to Agent-9 or neutral. | No |
| **apps/studio/app/components/studio-nav.tsx** | Nav: "Live Twin", "Promotion", etc. | Other (UI) | **Translate** | Twin and lane labels. | Canon lane labels; "Live" instead of "Live Twin". | No |
| **packages/agent/** | Session pipeline, generation (writing/image), mediums. | Runtime + Event/Proposal | **Keep** | Core generation; no lane/role. | Optional: accept proposal_type hint for downstream; no change required for pivot. | No |
| **packages/memory/** | Archive, retrieve, lineage. | State | **Keep** | — | — | No |
| **packages/mediums/** | Registry, plugins (concept, image), extension classification. | Runtime | **Keep** | Extension classification is capability; can map to proposal_type. | Map extension_classification to canon proposal_type where session-runner creates proposals. | No |
| **canon/** (root) | Agent-9 Canon JSON (core + governance). | Other (canon) | **Keep** | Source of truth. | — | No |
| **supabase/migrations** | DB schema (twin_core_tables, habitat_v2, staging_habitat_composition, etc.). | State | **Keep** + **Translate** | Tables are shared; naming is Twin in places. | Add lane_id to proposal_record when ready; avoid renaming tables until necessary. | No |

---

## 4. Quarantine List

Files that should be **quarantined** (not deleted, but not extended; replace or refactor before adding new Twin-specific logic):

| Item | Reason |
|------|--------|
| **apps/studio/lib/twin-seed-config.ts** | Twin-named identity seed; used for bootstrap. Replace with identity-seed or agent-9 config and rename. |
| **apps/studio/app/api/proposals/counts/route.ts** | Twin-only counts. Quarantine until replaced by canon lane_id counts; do not add new Twin count keys. |
| **Legacy role literals** (habitat_layout, avatar_candidate, extension) in session-runner and anywhere else | Do not add new code paths that depend on these; quarantine all usages and replace with proposal_type + canon lane. |
| **Hardcoded "surface" / "medium" / "system" lane lists** in review hub and staging | Quarantine; replace with canon lane_map-driven lists. |

---

## 5. Delete-Later List

Do not delete until canon wiring and replacement are in place and tested.

| Item | Delete after |
|------|--------------|
| **Legacy role-based branch in classifyProposalLane** (proposal-governance) | When all callers pass proposal_type and no code path uses proposal_role for classification. |
| **Twin-only count keys** (identity_name, public_habitat_proposal, avatar_candidate) in counts API | When UI and any consumers use lane_id counts only. |
| **getMaxPendingHabitatLayoutProposals, getMaxPendingAvatarProposals, getMaxPendingExtensionProposals** (stop-limits) | When caps are per proposal_type/lane_id and session-runner uses them. |
| **StagingLaneBucket enum** (habitat | artifacts | critiques | extensions | system) in staging-read-model | When read model is lane_id–based and UI updated. |
| **Duplicate "Surface / Medium / System" copy** in review hub and nav | When review hub and nav use canon lane_map labels. |
| **Compat mapping** (canon/compat.ts) | When proposal_record has lane_id and no code uses LaneType enum for lane identity. |

---

## 6. Recommended Cleanup Order

1. **Canon and governance (no UI)**  
   - proposal-governance: remove surface-only staging/promotion; use canon stageable lanes and (if ready) block_conditions/promotion_rules.  
   - Keep governance-rules FSM as-is.  
   - Add GET `/api/canon/lanes` (or include in existing canon API) returning lane_map.

2. **Session-runner and proposal creation**  
   - session-runner: in manageProposals, set proposal_type from canon (e.g. layout, avatar, extension → canon types); call classifyProposalLane with proposal_type only; remove habitat_layout/avatar_candidate/extension literals for classification.  
   - stop-limits: replace role-based caps with per–proposal_type or per–lane_id caps (canon or env).

3. **Staging read model and staging APIs**  
   - staging-read-model: bucket by canon lane_id; labels from lane_map; deprecate StagingLaneBucket or map from lane_id.  
   - staging/review and staging/proposals APIs: use canon stageable lanes.

4. **Review hub and review pages**  
   - review/page.tsx: fetch canon lanes, count by lane_id, render from canon.  
   - review/surface, medium, system: use canon labels; optionally consolidate to /review/[laneId].

5. **Proposal APIs**  
   - proposals/counts: return counts by lane_id (and optionally proposal_type).  
   - proposals POST and artifacts/[id]/create-proposal: require/accept proposal_type; classification canon-only.

6. **UI copy and nav**  
   - Replace "Twin Studio", "Live Twin", "habitat", "avatar" in copy with product name and canon-derived labels.  
   - studio-nav and links: use canon lane labels.

7. **Quarantine and delete-later**  
   - Remove legacy role-based classification path once no callers.  
   - Remove Twin count keys and role-based stop-limits when replacements are live.  
   - Remove compat layer when DB has lane_id and everything reads from canon.

---

## 7. Files That Must Not Be Renamed Blindly (Wrong Semantics)

These encode **semantics** that would remain wrong after a cosmetic rename. Fix the behavior and data model first, then rename if needed.

| File / symbol | Why not rename blindly |
|----------------|------------------------|
| **session-runner: manageProposals** | Renaming "habitat_layout" to "layout_proposal" without switching to canon proposal_type and primary_lane keeps the same broken flow. Fix: emit proposal_type, use classifyProposalLane(proposal_type), then optionally rename. |
| **proposal-governance: surfaceRoles / mediumRoles / systemRoles** | Renaming to "buildRoles" etc. without removing the role→lane mapping keeps ontology in code. Fix: remove legacy branch; all lanes from canon. |
| **proposal-governance: canTransitionProposalState (surface-only)** | Renaming "surface" to "stageable" in copy still hardcodes which lane is stageable. Fix: derive stageable from canon (lane_map/promotion_rules). |
| **staging-read-model: StagingLaneBucket (habitat, artifacts, …)** | Renaming buckets to "build", "audit" without changing how buckets are derived keeps role/lane_type logic. Fix: bucket by lane_id; then bucket names = canon labels. |
| **review/page.tsx: "Surface lane", "Medium lane", "System lane"** | Find-replace to "Build lane", etc. without fetching lanes from canon leaves wrong count and wrong set of lanes. Fix: drive sections and counts from canon. |
| **proposals/counts: identity_name, public_habitat_proposal, avatar_candidate** | Renaming keys to "name_proposal", "layout_proposal", "avatar_proposal" still returns Twin-specific slices. Fix: return lane_id (and proposal_type) counts; then UI can show any slice. |
| **stop-limits: getMaxPendingHabitatLayoutProposals, …** | Renaming to getMaxPendingLayoutProposals keeps the cap tied to a single role. Fix: caps by proposal_type or lane_id; then rename. |
| **packages/core: initiated_by "twin"** | Renaming to "agent" in enum is fine, but call sites must map to agent_id (e.g. agent_9) for agent_registry; otherwise authority checks stay wrong. |
| **habitat-payload.ts** | Renaming file to layout-payload.ts is cosmetic; the payload shape is "layout/public content". Semantics are fine; only "habitat" in name is Twin. Optional rename after product rename. |

---

**End of audit.**
