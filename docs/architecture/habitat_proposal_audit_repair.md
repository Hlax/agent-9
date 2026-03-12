# Habitat proposal review/apply flow — audit and repair

## 1. Root cause: why approving for staging did not visibly update staging

**Cause:** The staging data path was incomplete; no layout payload reached the staging UI.

- **POST /api/proposals/[id]/approve** with `action: "approve_for_staging"` only updated `proposal_record.proposal_state` to `approved_for_staging`. It did not write to any separate staging table (by design: staging is proposal-driven).
- **GET /api/staging/proposals** (used by the habitat-staging app) did **not** select `habitat_payload_json` or `proposal_role`. So the staging app received approved proposals but had no layout payload to render and no role/surface context.
- The habitat-staging app’s “Staged proposal preview” panel was mock-only and did not consume any real payload.

**Conclusion:** Staging visibility depends on the staging API returning the same proposal records (including `habitat_payload_json`) that the runner creates. The API was omitting the payload, so approving for staging changed state in the DB but did not “visibly update” staging.

---

## 2. Endpoint / action mapping (Studio UI)

| UI action | Endpoint | Method | Body / behavior |
|-----------|----------|--------|------------------|
| **Approve for staging** (concept, pending) | `/api/proposals/[id]/approve` | POST | `{ action: "approve_for_staging" }` → FSM to `approved_for_staging`; no domain side-effect for habitat (by design). |
| **Approve for publication** (habitat) | `/api/proposals/[id]/approve` | POST | `{ action: "approve_for_publication" }` → FSM to `approved_for_publication`; **writes** to `public_habitat_content` for habitat/concept. |
| **Mark as staged** | `/api/proposals/[id]` | PATCH | `{ proposal_state: "staged" }` → FSM only. |
| **Reject / Archive / Ignore** | `/api/proposals/[id]` | PATCH | `{ proposal_state: "rejected" \| "archived" \| "ignored" }`. |
| **Unpublish to staging / Unpublish + archive** | `/api/proposals/[id]/unpublish` | POST | Privileged rollback; moves proposal back (e.g. to `approved_for_staging`) and optionally archives. |

The Studio habitat list uses **both** POST approve (for domain side-effects: approve_for_staging, approve_for_publication) and **PATCH** (for state-only transitions: staged, archived, rejected, etc.). FSM legality is enforced in both routes via `isLegalProposalStateTransition` (approve) and `isValidProposalTransition` → `isLegalProposalStateTransition` (PATCH).

---

## 3. Full flow (before vs after)

### Before repair

1. **Proposal creation:** Session runner creates `proposal_record` (e.g. `habitat_layout`, `target_surface: staging_habitat`, `habitat_payload_json` set).
2. **User approves for staging:** Studio calls POST `/api/proposals/[id]/approve` with `action: "approve_for_staging"` → `proposal_record.proposal_state` = `approved_for_staging`.
3. **Staging app:** GET `/api/staging/proposals` returns that row but **without** `habitat_payload_json` and **without** `proposal_role`.
4. **Staging UI:** Renders proposal title/summary/status only; “Staged proposal preview” was mock. **No visible layout update.**

### After repair

1. **Proposal creation:** Unchanged.
2. **User approves for staging:** Unchanged (POST approve → `approved_for_staging`).
3. **Staging API:** GET `/api/staging/proposals` now selects `habitat_payload_json` and `proposal_role` so the staging consumer receives the full proposal record.
4. **Staging UI:** Maps `habitat_payload_json` and `proposal_role` / `proposal_state` into the list; “Staged proposal preview” shows **“Layout payload applied to staging”** with page and block count when payload is present. **Staging visibly shows the approved layout.**
5. **Studio review UI:** Proposal cards now show **proposal role**, **target surface**, **current proposal state**, **whether payload has been applied** (in staging vs published), and **next legal actions** (from FSM). Actions for `approved_for_staging` / `staged` include “Mark as staged” (PATCH) and “Approve for publication” (POST approve).

---

## 4. Files changed

| File | Change |
|------|--------|
| `apps/studio/app/api/staging/proposals/route.ts` | Added `habitat_payload_json` and `proposal_role` to the `select()` so staging gets the full proposal payload and role. |
| `apps/studio/lib/governance-rules.ts` | Added `getNextLegalProposalActions(currentState)` returning the list of legal next states from the FSM map. |
| `apps/studio/app/review/surface/habitat/habitat-proposal-list.tsx` | Modernized cards: show role, target surface, state, “Payload: present / none”, “Visible in staging” / “Applied to public” / “Not yet applied”, and next legal actions (Mark as staged, Approve for publication, Archive, Reject). Use POST approve for approve_for_staging / approve_for_publication and PATCH for state-only transitions. |
| `apps/habitat-staging/app/page.tsx` | Extended `ChangeProposal` with `proposal_role`, `proposal_state`, `habitat_payload_json`. Map these from the API. In “Staged proposal preview”, show state/role and a “Layout payload applied to staging” block (page + block count) when `habitat_payload_json` is present. |
| `apps/studio/lib/__tests__/governance-rules.test.ts` | Added tests for `getNextLegalProposalActions`. |

**Not changed:** No DB schema changes. No new apply path in the session runner. No bypass of proposal FSM. Approve route still uses the same FSM and side-effect rules (habitat publication still writes to `public_habitat_content` only when action is `approve_for_publication`).

---

## 5. Remaining ambiguity: “approve”, “stage”, “apply”

- **Approve (for staging):** FSM transition to `approved_for_staging`. No write to a staging table; “staging” is defined as “proposals in approved_for_staging or staged that the staging app fetches and displays.” So “approve for staging” = gate the proposal for staging visibility; the payload is then visible via GET `/api/staging/proposals`.
- **Stage / Mark as staged:** FSM transition to `staged` (PATCH). Optional human step to indicate “this is the one we’re treating as the current staging layout.” No separate “apply” write; staging app still reads from the same API and can prefer `staged` over `approved_for_staging` if desired.
- **Apply:** In this codebase “apply” is used for (1) **publication** — POST approve with `approve_for_publication` **applies** the habitat payload to `public_habitat_content`; (2) **name/avatar** — apply_name / approve_avatar update identity and move proposal to `approved_for_staging`. For **habitat staging**, there is no separate “apply” step: the proposal record (including `habitat_payload_json`) is the source of truth, and the staging API now exposes it so the staging app can render it. So “approve for staging” + “staging API returns payload” = “layout is applied to staging” in the sense of “visible and renderable in the staging environment.”

**Post–branch design (staging composition):** A first-class staging composition is now implemented. See `docs/architecture/habitat_branch_staging_design.md`. Approving a habitat proposal for staging **merges** its payload into `staging_habitat_content` (per-page). The staging app reads from GET `/api/staging/composition` (branch head). Public updates only when a human runs **“Push staging to public”** (POST `/api/staging/promote`), which copies staging to public and records the promotion. Proposal FSM and governance are unchanged; merge is the side-effect of approve_for_staging.
