# Studio v2 — Stage-Based Navigation Spec

**Status:** Specification for future implementation  
**Goal:** Make the Studio UI mirror the system pipeline so the flow is obvious.  
**Constraint:** Navigation and layout only; no backend or contract changes required.

**Canon:** Twin pipeline — **Runtime → Proposal → Governance → Staging → Promotion → Public Snapshot**  
**Operating model:** detect → decide → compose → record → serve

---

## 1. Why Studio v2

- **Current state:** Studio is task/lane-based (Session, Review, Surface/Habitat, etc.). It works for development but hides the system flow.
- **Target state:** Studio becomes **stage-based**. Primary navigation is five areas, each mapping to one part of the pipeline. The pipeline becomes visible at a glance.

**No backend changes are required.** This is almost entirely a navigation and layout improvement.

---

## 2. Top-Level Navigation

Replace many flat sections with five stage-based areas:

```
Studio
 ├ Runtime
 ├ Proposals
 ├ Staging
 ├ Promotion
 └ Live Twin
```

| Navigation   | Architecture Layer | Purpose |
|-------------|--------------------|---------|
| **Runtime** | Detection          | Agent signals, sessions, traces |
| **Proposals** | Proposal + Governance | Review suggested changes |
| **Staging** | Composition        | Candidate twin workspace |
| **Promotion** | History          | Snapshot creation & lineage |
| **Live Twin** | Serving          | What the public sees |

This makes the pipeline obvious: **Runtime → Proposals → Staging → Promotion → Live Twin**.

---

## 3. Area 1 — Runtime

**Purpose:** Detection layer. Show what the agent is doing and discovering.

**Sections:**

```
Runtime
 ├ Sessions
 ├ Signals
 ├ Trace / Logs
 └ Runtime Configuration
```

**Example UI:**

- **Runtime Signals**
  - Suggested habitat update
  - Medium extension idea
  - Trait refinement
- Actions: **Create proposal**, **Inspect signal**

**Rule:** Runtime never modifies staging or public. It only detects and suggests (proposals).

---

## 4. Area 2 — Proposals

**Purpose:** Proposal + Governance. Everything waiting for review.

**Sections:**

```
Proposals
 ├ Habitat proposals
 ├ Medium proposals
 ├ Extension proposals
 └ Archived proposals
```

**Example table:**

| ID    | Lane      | Status           | Action  |
|-------|-----------|------------------|---------|
| P-104 | habitat   | pending_review   | Review  |
| P-105 | medium    | needs_revision   | Fix     |
| P-106 | extension | approved         | Staged  |

**Inside a proposal:**

- Approve for staging  
- Needs revision  
- Reject  
- Archive  

**Important rule:** **Approve for staging ≠ publish.** Approve for staging moves content into the candidate workspace (Staging); it does not push to public.

---

## 5. Area 3 — Staging

**Purpose:** Candidate composition. Workspace for the next twin state.

**Sections:**

```
Staging
 ├ Habitat workspace
 ├ Staged proposals
 ├ Staging preview
```

**Example:**

- **Staging Habitat — Blocks**
  - Greeting  
  - Memory panel  
  - Traits  
  - Medium extension  

**Actions:**

- Preview staged twin  
- Remove staged item  
- Reorder blocks  

**Primary button:** **Push staging to public** — triggers promotion (creates snapshot, updates public).

---

## 6. Area 4 — Promotion

**Purpose:** Snapshot history. Show every promotion event.

**Sections:**

```
Promotion
 ├ Snapshot history
 ├ Promotion records
 └ Snapshot diffs
```

**Example:**

| Snapshot ID | Date       | Changes          |
|-------------|------------|------------------|
| 42          | 2026-03-13 | greeting update  |
| 41          | 2026-03-10 | trait block      |

**Promotion UI (when pushing):**

- **Create snapshot?**
- Current: 41 → Next: 42  
- **Changes:** e.g. + Greeting update  

---

## 7. Area 5 — Live Twin

**Purpose:** Public serving layer. The actual twin served to users.

**Data source (mandatory):**

- Must read from **`habitat_snapshot`** (latest approved public snapshot).
- Must **not** read from `public_habitat_content` for “what is live.” Public truth is snapshot-backed.

**Example:**

```
LIVE TWIN

Snapshot ID: 42
Published: 2026-03-13

Hello Twin!

Actions:
- View snapshot diff
- View lineage
- Open public site
```

**Rule:** This panel is **read-only**. No edits to snapshot or public state from here.

---

## 8. The Biggest Immediate Fix — Live Twin

**Current gap:** Studio shows **Promotion output** from `public_habitat_content`. The real source of truth for what the public sees is **`habitat_snapshot`**.

**Studio v2 requirement:** Add a **Live Twin** area that shows the **snapshot-backed** twin:

- Consume the same data the public site uses: e.g. `GET /api/public/habitat-content` (which reads `habitat_snapshot` only), or a dedicated read from the latest `habitat_snapshot` for the active identity.
- Display: snapshot id, published date, and rendered habitat (or key blocks) so the operator sees exactly what is live.
- Optional: “Promotion output” (public_habitat_content) can remain as a separate, clearly labeled admin view (e.g. “Content written by promotion”) so it’s not confused with Live Twin.

---

## 9. Studio Dashboard (Optional but Powerful)

Add a **Pipeline Overview** to the Studio home.

**Summary counts:**

- Runtime signals: 3  
- Proposals waiting: 5  
- Staged items: 2  
- Promotion ready: 1  
- Live snapshot: 42  

**Visual pipeline:**

```
Runtime → Proposals → Staging → Promotion → Public
```

This instantly answers:

- What is live?  
- What is staged?  
- What is pending review?  
- What did the agent detect?  

---

## 10. Studio v2 in One Picture

```
+--------------------------------------------------+
|                 LIVE TWIN                        |
|            Snapshot 42 — Hello Twin!             |
+--------------------------------------------------+

+-----------+-----------+-----------+---------------+
| Runtime   | Proposals | Staging   | Promotion     |
+-----------+-----------+-----------+---------------+
```

The pipeline becomes visible: Live Twin at top (what’s served), then the four active stages in a row.

---

## 11. Mapping Current Studio to v2

| Current Studio              | Studio v2   |
|----------------------------|-------------|
| Sessions                   | Runtime     |
| Runtime panel              | Runtime     |
| Review lanes (Surface / Medium / System) | Proposals |
| Surface / Habitat pages   | Staging     |
| Staging page               | Staging     |
| Push staging to public     | Promotion   |
| Promotion history          | Promotion   |
| **(missing)**              | **Live Twin** |

Existing backend and APIs support this. Implementation is primarily:

- Reorganizing routes/pages under the five top-level areas.
- Adding the **Live Twin** view that reads from `habitat_snapshot` (or from the same API the public site uses).
- Optionally adding the pipeline overview on the Studio home.

---

## 12. Implementation Notes (When Building)

- **No backend contract changes.** Use existing: `/api/runtime/*`, `/api/proposals/*`, `/api/staging/composition`, `/api/staging/promote`, `/api/staging/promote/history`, `/api/public/habitat-content` (for Live Twin).
- **Governance unchanged.** All proposal state transitions still go through `canTransitionProposalState` and existing approve/PATCH routes.
- **Promotion unchanged.** “Push staging to public” continues to call `POST /api/staging/promote`; it creates a new `habitat_snapshot` and updates `public_habitat_content` and proposal states as today.
- **Live Twin:** New UI only. Read from `habitat_snapshot` (e.g. via existing `/api/public/habitat-content` or a small wrapper that returns latest snapshot metadata + payload for Studio display). No write paths.

---

## 13. Why This Is the Right Time

| Dimension           | Current                     | After Studio v2              |
|--------------------|-----------------------------|------------------------------|
| Architecture       | Clean                       | Clean                        |
| Backend pipeline   | Correct                     | Correct                      |
| Studio UI          | Developer-oriented, task-based | Architecture-aligned, stage-based |

Studio v2 keeps architecture and backend intact and makes the UI mirror the pipeline, which will make development and onboarding easier as the agent grows.

---

## 14. References

- **Implementation Checklist:** `docs/05_build/IMPLEMENTATION_CHECKLIST.md`  
- **Studio UI Audit:** `docs/05_build/STUDIO_UI_ARCHITECTURE_AUDIT.md`  
- **Staging pipeline:** `docs/04_product/staging_pipeline_mvp_closure.md`  
- **Existing redesign notes:** `docs/05_build/STUDIO_UI_REDESIGN_PLAN.md` (lane clarity, copy; can be merged with v2 navigation)

---

*End of Studio v2 spec.*
