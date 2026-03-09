# Phase 4 Fix Map

This file identifies the exact canon locations that should be updated before a coding agent begins scaffolding.

---

## 1. `cursor_agent_build_instructions.md`

### A. Fix the artifact lifecycle

**Current lines:** 88-93

Current text:

```md
Artifacts should move through states:

draft → pending_review → approved → published

Approval and publication must remain separate concepts.
```

**Problem:**
This sequence collapses approval and publication even though the sentence below says they must remain separate.

**Replace lines 88-93 with:**

```md
Artifacts should move through approval states such as:

draft → pending_review → approved / approved_with_annotation / needs_revision / rejected / archived / approved_for_publication

Publication state must remain separate from approval state.

Recommended publication states for V1:

private / internal_only / scheduled / published
```

### B. Fix Studio actions

**Current lines:** 98-105

Current text:

```md
-   start sessions
-   review artifacts
-   annotate outputs
-   approve or reject artifacts
-   publish artifacts
```

**Problem:**
This is too loose for the two-step public safety rule and does not account for staging approvals or surface proposals.

**Replace lines 98-105 with:**

```md
-   start sessions
-   review artifacts
-   annotate outputs
-   approve, reject, revise, or archive artifacts
-   mark artifacts approved_for_publication
-   publish approved artifacts
-   approve staging proposals
-   review and promote staging releases to public
```

### C. Soften runtime wording

**Current lines:** 60-70

Current text ends with:

```md
The runtime loop must remain deterministic and observable.
```

**Problem:**
With GPT and Krea in the loop, “deterministic” is too strong and may push the coding agent toward fake determinism.

**Replace the final sentence with:**

```md
The runtime loop must remain observable, auditable, and replay-friendly.
```

---

## 2. `coding_agent_architecture_rules.md`

### A. Add staging habitat to UI ownership

**Current lines:** 73-81

Current text:

```md
UI code belongs in:

packages/ui\
apps/studio\
apps/public-site

UI should interact with APIs rather than implementing domain logic.
```

**Problem:**
This omits `apps/habitat-staging`, even though staging is a first-class surface elsewhere in the canon.

**Replace lines 73-81 with:**

```md
UI code belongs in:

packages/ui\
apps/studio\
apps/habitat-staging\
apps/public-site

UI should interact with APIs rather than implementing domain logic.
```

### B. Add release-lane safety note

**Insert after line 81:**

```md
Habitat and surface changes should be treated as release proposals rather than ordinary artifact publication.
Agents must not treat staging previews, surface configuration, or public habitat changes as equivalent to publishing an artifact record.
```

---

## 3. `build_architecture.md`

### A. Tighten Studio action wording

**Current lines:** 147-155

Current text:

```md
Features:

-   start sessions
-   review artifacts
-   annotate work
-   manage projects
-   ingest sources
-   approve or publish outputs
```

**Problem:**
This again collapses approval and publication.

**Replace lines 147-155 with:**

```md
Features:

-   start sessions
-   review artifacts
-   annotate work
-   manage projects
-   ingest sources
-   approve or reject outputs
-   mark outputs approved_for_publication
-   publish approved artifacts
-   review staging habitat proposals
-   promote approved staging releases to public
```

### B. Add stack lock note

**Insert after line 68:**

```md
Recommended V1 implementation stack:

- TypeScript monorepo
- Next.js for all three apps
- Supabase for Postgres, auth, and storage
- Vercel for deployment
- GPT as the first generation brain
- Krea as an image-generation adapter
- Python optional later, not required for scaffold phase
```

---

## 4. `private_studio.md`

### A. Fix purpose summary

**Current lines:** 12-21

Current text includes:

```md
- approve or reject artifacts
- publish work
```

**Problem:**
This is too vague for the two-step rule and does not reflect staging control.

**Replace lines 12-21 with:**

```md
The studio allows Harvey to:

- start creative sessions
- review artifacts
- annotate outputs
- manage projects
- ingest source material
- approve, reject, revise, or archive artifacts
- mark artifacts approved_for_publication
- publish approved artifacts
- review staging proposals
- promote approved staging releases to public
```

### B. Fix review actions

**Current lines:** 43-50

Current text:

```md
approve  
reject  
annotate  
archive  
publish
```

**Replace lines 43-50 with:**

```md
approve  
approve_with_annotation  
needs_revision  
reject  
archive  
approve_for_publication  
publish
```

### C. Tighten workflow wording

**Current lines:** 79-89

Current text ends with:

```md
Approval state updated
↓
Optional publication
```

**Replace lines 79-89 with:**

```md
Twin generates artifacts  
↓  
Artifacts appear in studio review queue  
↓  
Harvey reviews outputs  
↓  
Approval state updated  
↓  
Optional approve_for_publication decision  
↓  
Optional publication action
```

---

## 5. Canon confirmation references (no change needed)

These files already support the intended model and should be used as anchors:

- `approval_state_machine.md` lines 50-95: approval vs publication separation
- `approval_state_machine.md` lines 102-113: recommended approval states
- `approval_state_machine.md` lines 14-40: publication is downstream of approval and release actions
- `release_archive.md` lines 20-27: archive requires both `approved_for_publication` and `published`
- `data_model.md` lines 69-88: human review and publication are separate layers
- `staging_habitat.md` lines 45-50: staging does not equal public release

---

## 6. Recommended new docs to add now

- `phase_4_build_contract.md`
- `runtime_invariants.md`
- `approval_lanes.md`
- `surface_release_model.md`
- `v1_vertical_slice.md`
- `identity_seed_ingestion.md`
- `mind_test_spec.md`
