# Approval State Machine

This document defines the Twin’s human-facing approval states for artifacts and how artifacts move between them.

The Approval State Machine exists to answer a different question than self critique or evaluation.

- self critique asks: what did this artifact do well or poorly?
- evaluation asks: how should runtime behavior respond?
- approval state asks: what is this artifact’s current review and release status?

These layers must remain separate.

An artifact may be creatively strong and still remain unapproved.
An artifact may be approved for preservation but not approved for publication.
An artifact may be rejected for publication without being erased from memory or lineage.

---

## Watchouts

### Collapsing Judgment Layers

Do not treat:

- `critique_outcome`
- evaluation signal patterns
- archive suggestions
- approval state
- publication state

as the same thing.

Examples of incorrect collapse:

- `archive_candidate` automatically means rejected
- strong pull automatically means approved
- Harvey annotation automatically means published
- runtime stop logic automatically means deleted

The runtime may recommend.
Harvey review decides human-facing approval.

### Binary Thinking

Approval should not be modeled as only yes or no.

The Twin needs intermediate states so artifacts can be:

- unreviewed
- held for later
- approved internally
- revised after annotation
- approved for publication later

Without intermediate states, the system becomes brittle and loses useful history.

### Destructive Rejection

Rejection should usually mean “not approved for this use,” not “erase this artifact.”

Unless Harvey explicitly deletes something, rejected artifacts may still matter for:

- memory
- lineage
- recurrence detection
- self-understanding
- archive return later

---

## 1. Purpose of the Approval State Machine

The Approval State Machine tracks the human review status of an artifact after generation.

It helps the Twin and Harvey answer:

- has this artifact been reviewed yet?
- is it approved for retention?
- does it need revision or annotation?
- should it remain internal only?
- is it suitable for publication or external use?
- was it intentionally rejected?

Without an approval state machine, review decisions become ambiguous and hard to preserve.

With it, the system can keep runtime judgment separate from human curation.

---

## 2. Position in the Runtime

A practical high-level sequence is:

Generate Artifact  
↓  
Self Critique  
↓  
Evaluation Signals  
↓  
Creative State / Memory / Lineage Updates  
↓  
Enter Approval Queue  
↓  
Harvey Review  
↓  
Approval State Update  
↓  
Optional Publication Decision

This means approval is:

- downstream of generation
- downstream of self critique
- downstream of evaluation
- downstream of internal state updates
- upstream of publication or release actions

This also means an artifact can affect memory or lineage before Harvey reviews it.

That is acceptable.

Approval is about curation and release status, not whether the artifact existed as a meaningful event.

---

## 3. Approval vs Critique vs Evaluation vs Publication

These layers must remain distinct.

### Self Critique
The Twin’s qualitative internal reasoning.

Examples:
- the idea has energy but weak clarity
- the medium constrained the concept
- this should branch rather than continue

### Evaluation Signals
Structured runtime interpretation.

Examples:
- high pull
- moderate emergence
- low recurrence
- high fertility

### Approval State
Harvey-facing review status for the artifact.

Examples:
- `pending_review`
- `approved`
- `approved_with_annotation`
- `needs_revision`
- `rejected`
- `archived`
- `approved_for_publication`

### Publication State
External release status.

Examples:
- `private`
- `internal_only`
- `scheduled`
- `published`

Important rule:

Approval state is not the same as publication state.

An artifact may be approved but remain private.
An artifact may be archived but still historically approved.
An artifact may be annotated without being publishable yet.

---

## 4. Core Approval States for V1

Recommended V1 states:

- `pending_review`
- `approved`
- `approved_with_annotation`
- `needs_revision`
- `rejected`
- `archived`
- `approved_for_publication`

These are human-facing states.
They should not be overloaded with runtime meaning.

### pending_review
Default state after generation finishes and the artifact is eligible for Harvey review.

Use when:
- no human decision has been made yet
- the artifact exists and is retained
- critique/evaluation are complete or sufficiently available

### approved
The artifact is accepted as a valid retained artifact.

Use when:
- Harvey wants it preserved as part of the Twin’s body of work
- no additional revision is required
- it may still remain private

### approved_with_annotation
The artifact is accepted, but Harvey wants contextual notes attached.

Use when:
- Harvey adds interpretation, tags, warnings, or guidance
- the artifact is strong but should carry human framing
- future retrieval should preserve the annotation

### needs_revision
The artifact is not rejected, but should be revised before approval or release.

Use when:
- the core idea is promising
- execution is incomplete or misaligned
- Harvey wants another pass, medium shift, or edit

### rejected
The artifact is not approved for the intended role.

Use when:
- Harvey does not want it retained as an approved artifact
- it is weak, redundant, off-direction, or unsuitable
- it should not be treated as approved canon

Rejected does not automatically mean deleted.

### archived
The artifact is intentionally retained but not active.

Use when:
- Harvey wants it preserved without keeping it in active review circulation
- it has historical, reference, or return value
- it should not be treated as current active output

### approved_for_publication
The artifact is approved for external-facing release.

Use when:
- Harvey wants it publishable
- it satisfies both approval and external presentation standards
- publication may happen immediately or later

---

## 5. Recommended Default State

For V1, every newly generated artifact should enter:

`pending_review`

unless the system explicitly creates a runtime-only artifact that Harvey never intends to review.

This keeps human review explicit and auditable.

Suggested rule:

- generated artifact exists
- self critique and evaluation complete
- artifact enters `pending_review`
- Harvey later transitions it

---

## 6. State Transitions

Recommended V1 transitions:

### From `pending_review`
May move to:
- `approved`
- `approved_with_annotation`
- `needs_revision`
- `rejected`
- `archived`
- `approved_for_publication`

### From `needs_revision`
May move to:
- `pending_review`
- `approved`
- `approved_with_annotation`
- `rejected`
- `archived`
- `approved_for_publication`

### From `approved`
May move to:
- `approved_with_annotation`
- `archived`
- `approved_for_publication`

### From `approved_with_annotation`
May move to:
- `approved`
- `archived`
- `approved_for_publication`

### From `rejected`
May move to:
- `pending_review`
- `archived`

This allows reconsideration without pretending the original rejection never happened.

### From `archived`
May move to:
- `pending_review`
- `approved`
- `approved_with_annotation`
- `approved_for_publication`

This supports return and resurfacing behavior.

### From `approved_for_publication`
May move to:
- `archived`

Usually this should be a stable late-stage state.
Do not downgrade casually without an explicit reason.

---

## 7. Plain-English Transition Logic

Examples:

- `pending_review` → `approved`  
  Harvey accepts the artifact as valid internal work.

- `pending_review` → `approved_with_annotation`  
  Harvey accepts it but adds context or guidance.

- `pending_review` → `needs_revision`  
  The idea is worth keeping, but not in its current form.

- `pending_review` → `rejected`  
  Harvey decides it should not become approved canon.

- `pending_review` → `archived`  
  Harvey wants to keep it, but not keep it active.

- `approved` → `approved_for_publication`  
  Internal approval is followed by release approval.

- `needs_revision` → `pending_review`  
  A revised version is ready for another look.

- `archived` → `pending_review`  
  A resurfaced artifact is being reconsidered.

---

## 8. Approval and Critique Outcome Relationship

`critique_outcome` may influence review, but it does not determine approval state.

Examples:

- `continue` may still end in `needs_revision`
- `branch` may still end in `approved`
- `archive_candidate` may end in `archived`, `approved`, or even `rejected`
- `stop` may still be preserved for reference or lineage reasons

This rule matters because critique is internal judgment and approval is Harvey’s external curation layer.

Recommended interpretation:

- critique explains likely next-step value
- approval decides retained status
- publication decides external visibility

---

## 9. Approval and Evaluation Relationship

Evaluation signals may influence approval attention, but should not automatically set approval state.

Examples:
- high pull may increase review priority
- high fertility may make Harvey less likely to reject quickly
- low novelty may support rejection or archive
- high alignment may support approval
- repeated weak signal patterns may support rejection or archive

But no signal threshold should directly auto-approve or auto-reject in V1.

Harvey should remain the final decision-maker for approval transitions.

---

## 10. Approval and Archive Relationship

Archive is not synonymous with failure.

There are at least two meanings of archive:

### Runtime / Thread Archive
A direction is no longer active in generation flow.

### Approval-State Archive
Harvey intentionally preserves the artifact but removes it from active review or active foreground status.

These may overlap, but they are not identical.

An artifact may be:
- archived in approval state
- still important in lineage
- still retrievable from memory
- later revived for review or publication

The system should preserve archive as intelligent pause, not disappearance.

---

## 11. Approval and Versioning

Approval should attach to a specific artifact version or record snapshot.

This matters because:
- annotations may refer to a specific version
- revised artifacts may need fresh review
- approval history should remain traceable

Recommended V1 behavior:

- each version enters `pending_review` unless inherited rules are explicitly defined later
- prior approval states remain part of history
- revised versions do not silently overwrite prior review outcomes

This will connect directly to a later `versioning_policy.md`.

---

## 12. Approval and Human Annotation

Annotations are important enough to deserve explicit treatment.

When Harvey adds meaningful notes, prefer:

`approved_with_annotation`

instead of flattening the result into plain `approved`.

Examples of annotation value:
- explaining why the artifact matters
- warning that the piece is strong but off-brand for current use
- preserving future revisit guidance
- connecting the artifact to a larger direction
- clarifying why publication is deferred

This allows the Twin to preserve human judgment without collapsing it into free-floating comments.

---

## 13. Approval and Publication

Approval and publication should be modeled separately.

Suggested relationship:

- approval state answers: is this accepted?
- publication state answers: where can this appear?

Examples:
- `approved` + `private`
- `approved_with_annotation` + `internal_only`
- `approved_for_publication` + `scheduled`
- `approved_for_publication` + `published`

Do not assume publication from approval alone.

---

## 14. Persistence Guidance for V1

Not every state change needs equal weight, but approval history should be preserved more strongly than raw runtime chatter.

### Always Preserve
- first entry into `pending_review`
- first approval decision
- any transition to `rejected`
- any transition to `archived`
- any transition to `approved_for_publication`
- any approval decision carrying Harvey annotation

### Preserve Lightly or Compress
- repeated unchanged review passes
- minor metadata refreshes with no state change
- redundant system-level queue updates

Approval history should be auditable and interpretable.

---

## 15. Suggested Conceptual Fields

Suggested approval record shape:

```yaml
approval_record_id: uuid
artifact_id: uuid
approval_state: approval_state
reviewer: string | null
review_note: text | null
annotation_note: text | null
decided_at: timestamp
created_at: timestamp
updated_at: timestamp
```

Optional later support fields:

```yaml
previous_approval_state: approval_state | null
decision_reason: text | null
artifact_version_id: uuid | null
publication_state: publication_state | null
```

For V1, this can live as:

- a table
- a structured review object
- metadata attached to the artifact record

The key requirement is not implementation style.
The key requirement is preserving explicit approval transitions.

---

## 16. Example State Flow

Example 1:

```text
artifact generated
→ self critique: shift_medium
→ evaluation: high pull, low medium fit
→ enters pending_review
→ Harvey decides needs_revision
→ revised image version created
→ enters pending_review
→ Harvey decides approved
```

Example 2:

```text
artifact generated
→ self critique: archive_candidate
→ evaluation: low recurrence, moderate pull, useful summary
→ enters pending_review
→ Harvey decides archived
→ later related thread revives interest
→ archived artifact returns to pending_review
→ Harvey decides approved_with_annotation
```

Example 3:

```text
artifact generated
→ self critique: continue
→ evaluation: high alignment, high fertility
→ enters pending_review
→ Harvey decides approved
→ later marks approved_for_publication
```

---

## 17. Design Principles

**Separation over collapse**  
Approval should stay distinct from critique, evaluation, and publication.

**Retention over deletion**  
Rejected or archived artifacts may still matter historically.

**Traceability over ambiguity**  
State transitions should be explicit and reviewable.

**Human override over automation**  
Runtime can recommend; Harvey decides approval.

**Gradation over binary gates**  
Useful systems allow partial acceptance, annotation, revision, and delayed publication.

---

## 18. Summary

The Approval State Machine is the Twin’s human review status layer.

It does not replace critique.
It does not replace evaluation.
It does not replace archive logic.
It does not replace publication state.

It exists to preserve clear review transitions such as:

- pending review
- approved
- approved with annotation
- needs revision
- rejected
- archived
- approved for publication

With this layer, the Twin can separate internal creative judgment from human curation while preserving both.

---

## End Note: Possible Canon Updates After This Doc

### Glossary
Potential additions:
- `Approval State`
- `Approval State Machine`
- `Pending Review`
- `Approved With Annotation`
- `Needs Revision`
- `Approved for Publication`

### Ontology
Potential additions:
- place `Approval State` in the human review / governance layer
- distinguish it from self critique and evaluation signal layers
- distinguish approval status from publication status

### Data Model
Potential future entity:

```yaml
approval_record_id: uuid
artifact_id: uuid
approval_state: string
review_note: text | null
annotation_note: text | null
reviewer: string | null
decided_at: timestamp
created_at: timestamp
updated_at: timestamp
```
