# Approval Lanes

The Twin requires multiple approval lanes so that creative review, habitat release review, and system-change review do not collapse into a single yes/no action.

---

## 1. Why Approval Lanes Exist

Different outputs require different review criteria.
A poem, a staging layout, and a runtime rule change should not share the same approval meaning.

The lane model keeps the Twin supervised while still allowing broad exploration.

---

## 2. Lane Overview

### Lane A: Artifact Lane
For generated creative outputs.

Examples:
- writing artifacts
- image artifacts
- concept artifacts
- later audio/video artifacts

### Lane B: Surface Lane
For habitat and presentation proposals.

Examples:
- staging layouts
- collections
- navigation proposals
- public habitat release candidates
- visual identity proposals for the site

### Lane C: System Lane
For operational and structural proposals.

Examples:
- runtime changes
- evaluation logic changes
- memory logic changes
- policy changes
- coding-agent implementation plans
- Cursor-requested architecture changes

---

## 3. Artifact Lane

### Purpose
Preserve human curation over generated outputs.

### Typical review actions
- approve
- approve_with_annotation
- needs_revision
- reject
- archive
- approve_for_publication
- publish

### Key rule
Approval in the artifact lane does not approve a habitat release or system change.

---

## 4. Surface Lane

### Purpose
Control how the Twin’s work is staged, framed, and presented.

### Typical review actions
- approve_for_staging
- revise_staging_proposal
- reject_staging_proposal
- approve_release_candidate
- promote_to_public

### Key rule
A surface release is not the same as publishing an artifact record.
A surface release may involve staging review, code changes, configuration changes, or deployment actions.

---

## 5. System Lane

### Purpose
Prevent silent architectural drift while allowing the Twin to propose change.

### Typical review actions
- approve_proposal
- approve_with_constraints
- defer
- reject
- implement_via_cursor
- archive_proposal

### Key rule
System-lane approval means “safe to adopt or implement,” not “publish publicly.”

---

## 6. Suggested Review Criteria by Lane

### Artifact lane criteria
- creative force
- identity relevance
- novelty or emergence
- fertility
- coherence
- retention value
- publication suitability

### Surface lane criteria
- clarity of presentation
- alignment with Twin identity
- usefulness for staging/public experience
- safety and reversibility
- readiness for public exposure

### System lane criteria
- clarity
- need
- alignment with canon
- safety
- traceability
- reversibility

---

## 7. Suggested Data Model Direction

Lane support can be modeled in V1 using one of these approaches:

### Option A
A shared approval record with a `lane_type` field.

### Option B
Separate approval records for artifact, surface, and system proposals.

For scaffold phase, Option A is acceptable if transitions remain explicit.

Recommended enum values:
- `artifact`
- `surface`
- `system`

---

## 8. Studio Implications

Studio should let Harvey review items by lane.

At minimum, the UI should provide:
- artifact review queue
- surface proposal queue
- system proposal queue

They may share components, but they should not share ambiguous state language.

---

## 9. Coding-Agent Rule

Coding agents must not:

- treat all approvals as one state machine
- publish habitat changes through artifact publication logic
- treat system proposals as ordinary creative artifacts
- silently reuse artifact approval language for release promotion
