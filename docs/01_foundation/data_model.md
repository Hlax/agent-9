# Twin Data Model

This document defines the V1 foundation data model for the Twin.

It is not a final database migration file. It is the canonical schema-layer reference used to guide implementation in application code, schemas, and persistence.

## 1. Modeling Principles

The V1 data model should:

- preserve continuity across sessions
- support idea lineage and return behavior
- separate creative output from public publishing
- keep entity names aligned with the glossary
- allow future expansion without breaking core semantics

Scoring values in V1 should use **0.0 to 1.0 floats**.

## 2. Core Enums

### artifact_medium
- `writing`
- `image`
- `audio`
- `video`
- `concept`

### artifact_lifecycle_status
- `draft`
- `current`
- `superseded`

### session_mode
- `continue`
- `return`
- `explore`
- `reflect`
- `rest`

### creative_drive
- `coherence`
- `expression`
- `emergence`
- `expansion`
- `return`
- `reflection`
- `curation`
- `habitat`

### feedback_type
- `approve`
- `reject`
- `rank`
- `annotate`
- `tag`
- `comment`
- `mark_experimental`
- `mark_revisit`

### change_type
- `identity_update`
- `workflow_update`
- `system_update`
- `habitat_update`
- `embodiment_update`
- `evaluation_update`
- `governance_update`
- `other`

### initiated_by
- `twin`
- `harvey`
- `system`

### critique_outcome
- `continue`
- `branch`
- `shift_medium`
- `reflect`
- `archive_candidate`
- `stop`

### publication_state
- `private`
- `internal_only`
- `scheduled`
- `published`

### approval_lane
- `artifact`
- `surface`
- `system`

### approval_state
- `pending_review`
- `approved`
- `approved_with_annotation`
- `needs_revision`
- `rejected`
- `archived`
- `approved_for_publication`

## 3. Core Entities

## identity
Represents the current approved identity state of the Twin.

Suggested fields:

```yaml
identity_id: uuid
version_label: string
name: string | null
summary: text | null
philosophy: text | null
creative_values: jsonb | null
embodiment_direction: text | null
habitat_direction: text | null
status: string
is_active: boolean
created_at: timestamp
updated_at: timestamp
```

Notes:
- Usually only one active identity record should exist at a time.
- Prior identity states may be preserved historically through change records or future version tables.

## project
Represents a bounded area of work.

```yaml
project_id: uuid
title: string
slug: string
summary: text | null
description: text | null
status: string
priority: float | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- Project status can remain implementation-defined for now.
- Projects may group sessions, ideas, threads, and artifacts.

## idea_thread
Represents a larger line of creative continuity.

```yaml
idea_thread_id: uuid
project_id: uuid | null
title: string
summary: text | null
description: text | null
parent_thread_id: uuid | null
primary_theme_ids: uuid[] | null
status: string
recurrence_score: float | null
creative_pull: float | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- `parent_thread_id` allows later branching while staying simple.
- Thread status can remain implementation-defined for V1.

## idea
Represents a discrete creative seed or question.

```yaml
idea_id: uuid
project_id: uuid | null
title: string
summary: text | null
description: text | null
origin_session_id: uuid | null
status: string
recurrence_score: float | null
creative_pull: float | null
created_at: timestamp
updated_at: timestamp
```

Because an idea may belong to multiple threads, use a join table.

## idea_to_thread
Join model linking ideas to idea threads.

```yaml
idea_to_thread_id: uuid
idea_id: uuid
idea_thread_id: uuid
is_primary: boolean
created_at: timestamp
```

Notes:
- In V1, an idea may belong to multiple threads.
- Usually only one relationship should have `is_primary = true`.

## creative_session
Represents one bounded period of creative activity.

```yaml
session_id: uuid
project_id: uuid | null
mode: session_mode
selected_drive: creative_drive | null
title: string | null
prompt_context: text | null
reflection_notes: text | null
started_at: timestamp
ended_at: timestamp | null
created_at: timestamp
updated_at: timestamp
```

## creative_state_snapshot
Stores the Twin's creative state for a session.

```yaml
state_snapshot_id: uuid
session_id: uuid
identity_stability: float | null
avatar_alignment: float | null
expression_diversity: float | null
unfinished_projects: float | null
recent_exploration_rate: float | null
creative_tension: float | null
curiosity_level: float | null
reflection_need: float | null
idea_recurrence: float | null
public_curation_backlog: float | null
notes: text | null
created_at: timestamp
```

Notes:
- V1 uses session-level snapshots.
- Numeric state fields should use 0.0 to 1.0 floats where possible.
- `unfinished_projects` may later become an integer if preferred, but can remain normalized for scoring consistency.

## artifact
Represents a generated creative output.

```yaml
artifact_id: uuid
project_id: uuid | null
session_id: uuid | null
primary_idea_id: uuid | null
primary_thread_id: uuid | null
title: string
summary: text | null
medium: artifact_medium
lifecycle_status: artifact_lifecycle_status
current_approval_state: approval_state | null
current_publication_state: publication_state | null
content_text: text | null
content_uri: string | null
preview_uri: string | null
notes: text | null
alignment_score: float | null
emergence_score: float | null
fertility_score: float | null
pull_score: float | null
recurrence_score: float | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- `lifecycle_status` is for artifact-record lifecycle only. It must not replace approval or publication state.
- `current_approval_state` is a convenience cache of the latest approval transition.
- `current_publication_state` is a convenience cache of the latest publication transition.
- canonical approval history lives in `approval_record`.
- canonical publication history lives in `publication_record`.
- `content_text` supports text-based artifacts and concept artifacts.
- `content_uri` supports binary or remote media.
- `preview_uri` supports thumbnails, screenshots, or fast review representations later.
- `primary_idea_id` and `primary_thread_id` are convenience references; many-to-many joins may still be used for richer linking.
- artifact-level score fields represent the latest evaluation snapshot for quick access.
- the `evaluation_signal` entity stores the canonical evaluation history.
- artifact score fields should be treated as a convenience cache of the latest evaluation values.


## artifact_to_idea
Optional join model if one artifact should reference multiple ideas.

```yaml
artifact_to_idea_id: uuid
artifact_id: uuid
idea_id: uuid
is_primary: boolean
created_at: timestamp
```

## artifact_to_thread
Optional join model if one artifact should belong to multiple idea threads.

```yaml
artifact_to_thread_id: uuid
artifact_id: uuid
idea_thread_id: uuid
is_primary: boolean
created_at: timestamp
```

Notes:
- This supports the more flexible multi-thread relationship you asked for.
- For implementation simplicity, the system can still prefer one primary thread.

## critique_record
Represents qualitative self-critique attached to an artifact.

```yaml
critique_record_id: uuid
artifact_id: uuid
session_id: uuid | null
intent_note: text | null
strength_note: text | null
originality_note: text | null
energy_note: text | null
potential_note: text | null
medium_fit_note: text | null
coherence_note: text | null
fertility_note: text | null
overall_summary: text | null
critique_outcome: critique_outcome | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- A critique record is produced after artifact generation and before evaluation scoring.
- In V1, critique records are primarily artifact-level records.
- `critique_outcome` is a practical recommendation, not a human approval state.
- Critique records are qualitative and should remain distinct from evaluation signals.

## evaluation_signal
Represents structured evaluation attached to an entity.

```yaml
evaluation_signal_id: uuid
target_type: string
target_id: uuid
alignment_score: float | null
emergence_score: float | null
fertility_score: float | null
pull_score: float | null
recurrence_score: float | null
resonance_score: float | null
rationale: text | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- `target_type` may be `artifact`, `idea`, `idea_thread`, or `session`.
- This allows evaluation to grow beyond only artifacts.
- Evaluation signals may be informed by critique records, runtime context, recurrence logic, and later human feedback.
- Canonical persisted signals for V1 are `alignment_score`, `emergence_score`, `fertility_score`, `pull_score`, and `recurrence_score`.
- `resonance_score` is optional and future-facing.
- It may exist in the schema for forward compatibility, but should not be required, populated by default, or used in core V1 runtime logic unless formally adopted in a future system update.

## human_feedback
Represents explicit Harvey review input.

```yaml
feedback_id: uuid
target_type: string
target_id: uuid
feedback_type: feedback_type
score: float | null
note: text | null
tags: string[] | null
created_by: string
created_at: timestamp
```

Notes:
- `created_by` can remain simple in V1.
- Later versions may support richer reviewer identity models.

## approval_record
Represents explicit Harvey approval-state history for an artifact.

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

Notes:
- Approval state is distinct from critique outcome, evaluation signals, and publication state.
- An artifact may have multiple approval records over time.
- Approval history should preserve meaningful transitions rather than only the latest state.
- For V1, the current approval state is derived from the latest `approval_record` for an artifact unless a later implementation explicitly denormalizes it onto the `artifact` record.
- `approval_record` is the artifact-lane approval history for generated artifacts.
- surface-lane and system-lane review should not be forced into artifact approval records.

## publication_record
Represents explicit publication-state history for an artifact.

```yaml
publication_record_id: uuid
artifact_id: uuid
publication_state: publication_state
changed_by: string | null
note: text | null
effective_at: timestamp
created_at: timestamp
updated_at: timestamp
```

Notes:
- publication state is distinct from approval state.
- an artifact may have multiple publication records over time.
- `published` must only occur after an intentional release action.
- for V1, the current publication state may be cached on `artifact.current_publication_state`.

## proposal_record
Represents non-artifact review objects such as surface proposals and system proposals.

```yaml
proposal_record_id: uuid
lane_type: approval_lane
target_type: string
target_id: uuid | null
title: string
summary: text | null
proposal_state: string
preview_uri: string | null
review_note: text | null
created_by: string | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- `lane_type` should usually be `surface` or `system` for this entity.
- artifact-lane review should remain in `approval_record`.
- `proposal_state` may remain stringly typed in V1 to avoid overfreezing surface/system workflows too early.
- this entity exists so surface release review and system proposal review do not collapse into artifact approval.

## generation_run
Represents a generation attempt and preserves provenance for replay-friendly debugging.

```yaml
generation_run_id: uuid
session_id: uuid
artifact_id: uuid | null
medium: artifact_medium
provider_name: string | null
model_name: string | null
prompt_snapshot: text | null
context_snapshot: text | null
run_status: string
started_at: timestamp
ended_at: timestamp | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- V1 does not need perfect reproducibility.
- V1 does need enough provenance to review what happened.
- prompt snapshots may be stored directly or replaced by hashes later if required.

## archive_entry
Represents paused work with return context.

```yaml
archive_entry_id: uuid
project_id: uuid | null
artifact_id: uuid | null
idea_id: uuid | null
idea_thread_id: uuid | null
reason_paused: text | null
unresolved_question: text | null
creative_pull: float | null
recurrence_score: float | null
notes_from_harvey: text | null
last_session_id: uuid | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- An archive entry may reference an artifact, idea, thread, or some combination.

## change_record
Represents a meaningful change in the Twin's evolution.

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

## source_item
Represents a seeded input material.

```yaml
source_item_id: uuid
project_id: uuid | null
title: string
source_type: string
summary: text | null
content_text: text | null
content_uri: string | null
origin_reference: string | null
ingested_at: timestamp
created_at: timestamp
updated_at: timestamp
```

Notes:
- `source_type` may remain open for V1.
- Examples include note, transcript, prompt, image_reference, moodboard, fragment, upload.

## memory_record
Represents an internal memory unit.

```yaml
memory_record_id: uuid
project_id: uuid | null
memory_type: string
summary: text
details: text | null
source_session_id: uuid | null
source_artifact_id: uuid | null
importance_score: float | null
recurrence_score: float | null
created_at: timestamp
updated_at: timestamp
```

Notes:
- This is intentionally broader than source items and artifacts.

## theme
Represents a lightweight recurring motif.

```yaml
theme_id: uuid
name: string
slug: string
description: text | null
created_at: timestamp
updated_at: timestamp
```

## tag
Represents a flexible classification label.

```yaml
tag_id: uuid
name: string
slug: string
created_at: timestamp
updated_at: timestamp
```

## 4. Generic Association Strategy

V1 does not need fully normalized join tables for every possible association on day one.

A practical implementation path is:

- keep primary foreign keys on core tables where convenient
- add join tables where many-to-many relationships clearly matter
- only normalize further when behavior actually requires it

Minimum many-to-many joins recommended now:
- `idea_to_thread`
- `artifact_to_idea` if needed
- `artifact_to_thread` if needed

Future optional joins:
- entity-to-theme
- entity-to-tag
- source-item-to-idea
- memory-record-to-thread

## 5. Review and Publishing Model

The data model should separate:

- generation
- evaluation
- human review
- publication
- surface/system proposals

Recommended V1 logic:

- all new artifacts begin as `draft`
- after generation, self critique, and evaluation, review-eligible artifacts may enter `pending_review`
- Harvey may later create approval transitions such as `approved`, `approved_with_annotation`, `needs_revision`, `rejected`, `archived`, or `approved_for_publication`
- approval state is not the same as publication state
- `approved` means worth retaining
- `approved_for_publication` means cleared for external-facing release
- `published` means intentionally made public through a publication transition
- surface proposals and system proposals should not be forced into artifact approval records

This allows the system to accumulate useful work without forcing immediate publication decisions and without collapsing unrelated review lanes.

## 6. Staging Habitat and Code-Based Work

The ontology and data model do not require code previews to be treated as ordinary media artifacts.

Recommended approach:

- treat habitat implementation work as part of a `project`
- allow concept artifacts to define habitat directions
- allow source items to inform build work
- allow previews or screenshots to live in `preview_uri` or related future tables

A more detailed preview-review system can be added later in interface docs without changing the ontology core.

## 7. Canonical Constraints for Build Agents

Build agents should follow these rules:

- do not silently rename core entities
- do not redefine canonical enums without approval
- do not collapse `approved` and `published` into the same meaning
- do not treat source items, memory records, and artifacts as interchangeable
- do not remove idea-thread relationships for implementation convenience without approval

## 8. Future Expansion Notes

Likely later additions:

- artifact version history
- preview review entities for staging builds
- branch/merge records for idea threads
- visitor analytics entities
- embodiment-specific schema
- richer publication pipeline tables
- richer proposal-state enums for surface/system lanes
- publication scheduling helpers
- runtime event logs if generation provenance becomes insufficient

These can be added later without replacing the V1 foundation defined here.
