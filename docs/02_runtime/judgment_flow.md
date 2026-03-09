# Judgment Flow

This document defines the judgment pipeline that occurs after an
artifact is generated.

The judgment flow ensures that creative output is evaluated,
interpreted, and governed before it affects identity, memory weighting,
or publication decisions.

The goal is not to eliminate imperfect artifacts, but to understand
their meaning within the Twin's creative exploration.

------------------------------------------------------------------------

# Judgment Pipeline Overview

Generation → Self Critique → Evaluation Signals → Approval State →
Archive / Continue / Publish

Each stage adds a different type of understanding.

-   **Self Critique** adds qualitative interpretation.
-   **Evaluation Signals** add structured scoring signals.
-   **Approval State** adds human governance and direction.
-   **Archive / Continue / Publish** determines what happens next.

These layers must remain separate.

------------------------------------------------------------------------

# Stage 1 --- Artifact Generation

The Twin produces an artifact during a creative session.

Artifacts may be generated through: - exploration - continuation -
return - reflection

At the moment of generation, artifacts enter the system with:

-   `artifact_status = draft`
-   `approval_state = pending_review`

Generation itself does not determine quality or long-term value.

------------------------------------------------------------------------

# Stage 2 --- Self Critique

Immediately after generation, the Twin performs **self critique**.

Self critique answers questions such as:

-   What was the intent of this artifact?
-   What worked?
-   What failed?
-   What unresolved potential exists?
-   Should the idea continue, branch, shift medium, or stop?

The output of this step is a **critique record**.

A critique record contains: - qualitative analysis - interpretation of
intent - explanation of strengths and weaknesses - a **critique outcome
recommendation**

Examples of critique outcomes:

-   `continue`
-   `branch`
-   `shift_medium`
-   `reflect`
-   `archive_candidate`
-   `stop`

Self critique does not approve or reject artifacts.

------------------------------------------------------------------------

# Stage 3 --- Evaluation Signals

After critique, the system calculates **evaluation signals**.

Evaluation signals provide structured judgment signals.

Core V1 signals:

-   alignment_score
-   emergence_score
-   fertility_score
-   pull_score
-   recurrence_score

Signals may be numeric, categorical, or boolean depending on
implementation.

Evaluation signals help determine:

-   which ideas deserve continuation
-   which artifacts influence identity
-   which ideas recur over time

Evaluation signals are analytical, not authoritative.

They do not replace human judgment.

------------------------------------------------------------------------

# Stage 4 --- Approval State

After critique and evaluation, the artifact enters the **approval state
machine**.

Approval state is governed by **Harvey**.

Possible approval states:

-   `pending_review`
-   `approved`
-   `approved_with_annotation`
-   `needs_revision`
-   `rejected`
-   `archived`
-   `approved_for_publication`

Approval state determines how the system treats the artifact going
forward.

Examples:

`approved` → artifact may influence memory weighting

`needs_revision` → artifact remains draft and may be revisited

`rejected` → artifact should not influence direction

`approved_for_publication` → artifact becomes eligible for external
release

Approval state is distinct from artifact status.

------------------------------------------------------------------------

# Stage 5 --- System Consequences

Once approval state is determined, the system performs follow-up
actions.

Possible consequences include:

## Continue Development

Artifacts that show strong signals may trigger:

-   continuation sessions
-   idea thread expansion
-   medium exploration

## Archive

Artifacts that are not currently active but retain potential are
archived.

Archive preserves return potential.

## Identity Influence

Artifacts with strong pull or recurrence may influence:

-   identity evolution
-   thematic recurrence tracking

## Publication

Artifacts approved for publication may be surfaced in the Twin's habitat
or public environments.

Publication always requires Harvey approval.

------------------------------------------------------------------------

# Judgment Layer Separation

The system intentionally separates the layers of judgment.

  Layer                Purpose
  -------------------- ----------------------------
  Self Critique        interpret creative intent
  Evaluation Signals   structured scoring signals
  Approval State       human governance
  Artifact Status      lifecycle state
  Publication          external release decision

Collapsing these layers would weaken the system's interpretability.

------------------------------------------------------------------------

# Why This Flow Exists

The Twin is not designed to optimize for perfect artifacts.

It is designed to **understand its own creative process**.

The judgment flow ensures that artifacts are:

-   interpreted
-   evaluated
-   governed
-   preserved when meaningful
-   surfaced when appropriate

This pipeline allows the Twin to evolve creatively while maintaining
human oversight.
