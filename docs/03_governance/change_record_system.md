# Change Record System

This document defines how meaningful changes to the Twin are proposed, approved, recorded, and later retrieved.

A change record is not just a note.
It is the canonical governance log for structural evolution.

The Change Record System exists so the Twin can evolve without silently drifting.

---

## Watchouts

### Silent Drift

If important changes happen without records, later sessions cannot reliably answer:

- what changed?
- why did it change?
- who initiated it?
- was it approved?
- when did it become active?

This weakens continuity and makes debugging identity or behavior much harder.

### Treating Every Edit as a Governance Event

Not every small wording cleanup needs a major change record.

The system should preserve meaningful change, not create noise.

Use change records for changes that alter:

- behavior
- rules
- identity structure
- evaluation interpretation
- approval logic
- intervention boundaries
- environment or embodiment direction
- canonical documentation meaning

### Changing the System Before Approval

A proposed change is not active just because it was generated.

The Twin may propose.
Harvey approves.
The system adopts only after approval.

### Losing Superseded Context

When a newer rule replaces an older one, the older one should usually remain historically visible.

The goal is not only to store the latest truth.
The goal is to preserve the path of evolution.

---

## 1. Purpose of the Change Record System

The Change Record System preserves the Twin's approved evolution over time.

It helps answer:

- what changed in the system?
- what prompted the change?
- was the change proposed by the Twin, Harvey, or the system itself?
- was it approved?
- when did it become effective?
- what artifact, policy, identity layer, or runtime rule did it affect?

Without change records, the Twin's development becomes hard to audit and hard to trust.

With change records, evolution stays traceable.

---

## 2. What Counts as a Meaningful Change

A meaningful change is one that modifies the Twin's canonical behavior, interpretation, structure, or approved self-model.

Typical categories include:

- identity updates
- workflow updates
- system updates
- habitat updates
- embodiment updates
- evaluation updates
- governance updates

These align with the `change_type` enum already present in the data model.

Examples of changes that should usually receive change records:

- rewriting the Twin's core purpose language
- changing approval states or approval rules
- changing how evaluation signals are interpreted
- changing intervention thresholds or stop-limit logic
- promoting a draft policy into canonical governance
- changing review surfaces or release workflow
- adopting a new version of a foundational doc

Examples of changes that usually do **not** need standalone change records:

- typo fixes
- formatting cleanup
- section heading polish that does not change meaning
- purely presentational markdown cleanup

If a wording change changes system meaning, it is no longer "just formatting" and should be recorded.

---

## 3. Position in the Governance Layer

The Change Record System belongs to the Governance Layer.

It sits beside:

- approval rules
- intervention handling
- constitution enforcement
- versioning policy

Its role is different from those systems.

### Change records are not approval states
Approval state tracks the review status of an artifact.

### Change records are not critique records
Critique evaluates creative output.

### Change records are not version labels
Versioning tells us which revision exists.
Change records explain the meaning and authorization of important changes.

A practical relationship looks like this:

Draft or Proposal Created  
↓  
Optional Review / Discussion  
↓  
Harvey Approval or Rejection  
↓  
Change Record Written or Updated  
↓  
Affected document, rule, or runtime behavior becomes active  
↓  
Previous version remains historically retrievable

---

## 4. Required Fields for a Change Record

The V1 data model already defines a `change_record` entity.

Canonical fields:

```yaml
change_record_id: uuid
change_type: change_type
initiated_by: initiated_by
target_type: string | null
target_id: uuid | null
title: string
description: text
reason: text | null
approved: boolean | null
approved_by: string | null
effective_at: timestamp | null
created_at: timestamp
updated_at: timestamp
```

Recommended field meaning:

### change_type
The broad category of change.

### initiated_by
Who initiated the change.
Values in V1:
- `twin`
- `harvey`
- `system`

### target_type
What kind of thing the change affects.

Examples:
- `constitution`
- `policy_document`
- `artifact_rule`
- `evaluation_logic`
- `approval_logic`
- `identity`
- `surface`
- `runtime_behavior`

### target_id
Optional link to the affected entity if that entity already has a durable id.

### title
Short human-readable label.

Example:
`Separate approval state from publication state`

### description
What changed.
This should be explicit enough that future readers do not need to infer the meaning.

### reason
Why the change was proposed.
This should preserve context, not just the final decision.

### approved
Whether Harvey approved the change.

### approved_by
Usually Harvey in V1.

### effective_at
When the change became active.
This may differ from when it was first proposed.

---

## 5. Lifecycle of a Change

Recommended lifecycle in V1:

- `proposed`
- `approved`
- `rejected`
- `superseded`

The current data model stores approval as fields rather than a separate status enum.
That is acceptable for V1.

A simple interpretation is:

- `approved = null` → proposed / unresolved
- `approved = true` → approved
- `approved = false` → rejected
- superseded state can be represented later by linking a newer change record or version reference

If you later want cleaner lifecycle querying, you can add an explicit `change_status` enum.
For now, keep V1 simple.

---

## 6. When a Change Record Must Be Created

A change record should be created whenever one of the following happens:

### A foundational rule changes
Examples:
- constitution language changes meaning
- approval logic changes
- intervention boundaries change
- versioning rules change

### An approved identity change is adopted
Examples:
- name change
- revised summary or philosophy
- new embodiment direction
- major shift in creative values

### A runtime interpretation changes
Examples:
- evaluation signal meaning changes
- archive return thresholds change
- critique outcomes begin driving different state transitions

### A governance document becomes canonical
Examples:
- a draft markdown doc becomes the approved V1 rule
- an old governance doc is replaced by a better one

### Harvey explicitly overrules or redirects system behavior
Examples:
- disallowing a class of autonomous proposal
- requiring manual review before certain state changes
- tightening publication or intervention policy

---

## 7. Minimal Authoring Standard for Change Records

A good change record should answer five questions clearly:

1. What changed?
2. Why did it change?
3. Who initiated it?
4. Was it approved?
5. When did it become active?

Recommended markdown template:

```md
## Change Record

- Title:
- Change Type:
- Initiated By:
- Target Type:
- Target ID:
- Status:
- Effective At:

### Description

### Reason

### Approval Notes

### Supersedes / Related Changes
```

This template is for human readability.
The database record remains the canonical structured form.

---

## 8. Relationship to Versioning

Versioning and change records should work together.

### Versioning answers:
- which revision is current?
- what number or label identifies it?
- what changed between version A and B?

### Change records answer:
- why was the change important?
- who authorized it?
- what rule or behavior changed in substance?

Not every version increment needs a change record.
But every major governance or behavior change should usually have both:

- a new version
- a change record explaining the meaning of that version

---

## 9. Relationship to Agent Development

Yes — this system directly helps later agent development and self-improvement.

Why it matters:

### It prevents accidental regression
When behavior changes are recorded, future dev work can distinguish intentional evolution from bugs.

### It makes experimentation safer
The Twin can propose new structures or rules without immediately overwriting prior logic.

### It supports supervised self-improvement
The Twin may eventually suggest refinements to critique, memory, approval, or workflow logic.
Change records preserve those proposals and ensure Harvey-approved adoption.

### It improves debugging and eval analysis
If outputs become weaker or strange, the team can inspect which approved changes preceded the shift.

### It supports trust
A system that evolves without traceability becomes hard to govern.
A system with visible change history stays intelligible.

---

## 10. V1 Rules

For V1, the following rules should hold:

- the Twin may propose meaningful changes
- Harvey must approve changes before adoption
- approved changes should be recorded in `change_record`
- rejected changes may still be preserved for history
- superseded rules should usually remain retrievable
- change records should focus on meaningful governance or behavior changes, not trivial wording cleanup
- foundational doc changes that alter meaning should create both a new version and a change record

---

## 11. Recommended Future Extensions

Possible later additions:

- explicit `change_status` enum
- links between superseding and superseded change records
- per-document version references
- structured diff summaries
- reviewer notes history
- rollback metadata
- proposal confidence or risk labels

These are useful later, but not required for V1.

---

## 12. Canonical Summary

The Change Record System is the Twin's governance memory for meaningful evolution.

It exists so the system can change without losing:

- traceability
- authorization history
- causal context
- institutional memory

The Twin may evolve.
But meaningful change should never become invisible.
