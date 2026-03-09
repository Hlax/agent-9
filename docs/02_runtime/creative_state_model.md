# Creative State Model

This document defines how the Twin evaluates its internal creative condition and
uses that information to guide creative decisions during sessions.

The Creative State Model is the decision engine that influences:

- session mode selection
- creative drive weighting
- idea and project selection
- medium choice
- archive return behavior
- reflection vs exploration balance

Creative state evolves continuously as the Twin produces artifacts and reflects
on its work.

---

# Watchouts

The following behaviors are known risks for long-running creative systems and should be considered during implementation.

## Creative State Drift

Creative state values should not grow indefinitely across sessions.

Because state updates occur after each artifact and across many sessions, signals may gradually accumulate toward extreme values if left unconstrained.

To preserve meaningful behavior, runtime implementations should support mechanisms such as:

- bounded normalization
- smoothing or weighted averaging
- gradual decay over time

Example approaches may include:

- exponential decay
- rolling averages
- capped state ranges

The goal is to ensure that creative state remains interpretable and continues to meaningfully influence drive weighting and decision making over long periods of runtime operation.

---

# 1. Purpose of Creative State

The Creative State Model allows the Twin to behave as a **coherent evolving
creative system** rather than a stateless generator.

Creative state helps the Twin answer:

- What kind of work should I do right now?
- Should I continue something or explore something new?
- Am I stuck, repeating, or discovering?
- Is an older idea calling for attention again?

Creative state is influenced by:

- recent artifacts
- idea recurrence
- unfinished work
- evaluation signals
- archive signals
- human feedback

---

# 2. State Snapshot Timing

Creative state snapshots are recorded at the **session level**, but updates
occur **after each artifact generation**.

Flow:

Artifact Generated  
↓  
Self Critique  
↓  
Evaluation Signals  
↓  
State Adjustment  
↓  
Next Artifact Decision

At the end of the session a **final snapshot** is stored.

---

# 3. Core Creative State Fields

The following fields represent the Twin’s internal condition.

All values use **0.0 – 1.0 normalized floats**.

- `identity_stability`
- `avatar_alignment`
- `expression_diversity`
- `unfinished_projects`
- `recent_exploration_rate`
- `creative_tension`
- `curiosity_level`
- `reflection_need`
- `idea_recurrence`
- `public_curation_backlog`

---

# 4. Creative State Interpretation

Different state patterns influence behavior.

Examples:

Low `expression_diversity`  
→ encourage new medium exploration

High `unfinished_projects`  
→ bias toward `continue` or `return` session modes

High `idea_recurrence`  
→ prioritize resurfacing that idea thread

Low `creative_tension`  
→ consider exploration or rest

High `reflection_need`  
→ shift toward `reflect` sessions

---

# 5. Drive Weight Calculation

Creative drives operate as **weighted probabilities** rather than a single
dominant value.

Example drive weights are shown below for conceptual illustration.

> **Note:** Example weights in this section are illustrative.  
> The pseudocode implementation later in this document defines the **V1 runtime default weights** used by the system.

Example drive weights:

coherence: 0.30  
expression: 0.25  
emergence: 0.15  
expansion: 0.10  
return: 0.10  
reflection: 0.05  
curation: 0.03  
habitat: 0.02

The runtime selects drives probabilistically based on these weights.

Weights are influenced by the current creative state.

Examples:

- High `unfinished_projects` → increase `return` weight
- High `curiosity_level` → increase `emergence` weight
- High `reflection_need` → increase `reflection` weight
- High `avatar_alignment` gap → increase `coherence` weight
- High `public_curation_backlog` → increase `curation` weight

---

# 6. Recurrence Sensitivity

Idea recurrence increases when:

- similar themes appear across artifacts
- artifacts attach to the same idea thread
- archived ideas resurface

The recurrence signal increases **moderately aggressively** to encourage deeper
exploration of persistent ideas.

Example progression:

- Idea appears once → recurrence = 0.20
- Idea appears twice → recurrence = 0.40
- Idea appears across multiple sessions → recurrence = 0.60+

High recurrence increases probability of:

- `return` sessions
- continuation of existing threads
- artifact branching

---

# 7. Medium Selection Influence

Creative state influences medium selection.

Examples:

High `creative_tension` + conceptual theme  
→ `writing` or `concept` artifact

High visual identity exploration  
→ `image` artifact

High environment or interface exploration  
→ `concept` artifact with habitat context

High narrative or tonal exploration  
→ `audio` or `video` artifact

For V1, implementation-facing outputs such as component plans, UI system notes,
schema proposals, or Cursor build instructions are typically treated as
`concept` artifacts within a project rather than a separate artifact medium.

---

# 8. State Adjustment Rules

After each artifact, the system adjusts state values.

Example adjustments:

Successful artifact (high `pull_score`)  
→ increase `creative_tension` slightly

Low novelty artifacts  
→ decrease `emergence` influence

Repeated theme artifacts  
→ increase `idea_recurrence`

Many unfinished artifacts  
→ increase `unfinished_projects`

Reflection artifacts  
→ reduce `reflection_need`

Strong cross-medium experimentation  
→ increase `expression_diversity`

---

# 9. Session-Level Reflection

At session end, the Twin records a reflection summary.

Reflection may include:

- what themes appeared
- which ideas strengthened
- what directions feel promising
- whether identity signals shifted

This reflection becomes a **memory record** used in future sessions.

---

# 10. Failure Detection

Creative state helps detect unproductive loops.

Signals include:

- low emergence
- high repetition
- low fertility scores
- repeated critique patterns

If detected, the system may trigger:

- medium shift
- exploration mode
- archive suggestion
- reflection session

---

# 11. Long-Term Identity Evolution

Over time, the Creative State Model contributes to identity development.

Patterns in:

- idea recurrence
- evaluation signals
- artifact mediums
- human feedback

may influence identity proposals.

Identity changes require **Harvey approval**.

---

# 12. Runtime Pseudocode

The following pseudocode shows how creative state can be updated during a
session.

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class CreativeState:
    identity_stability: float = 0.5
    avatar_alignment: float = 0.5
    expression_diversity: float = 0.5
    unfinished_projects: float = 0.0
    recent_exploration_rate: float = 0.5
    creative_tension: float = 0.5
    curiosity_level: float = 0.5
    reflection_need: float = 0.3
    idea_recurrence: float = 0.2
    public_curation_backlog: float = 0.0


@dataclass
class ArtifactEvaluation:
    alignment_score: float
    emergence_score: float
    fertility_score: float
    pull_score: float
    recurrence_score: float
    novelty_score: float
    is_reflection_artifact: bool = False
    explored_new_medium: bool = False
    added_unfinished_work: bool = False


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def compute_drive_weights(state: CreativeState) -> Dict[str, float]:
    weights = {
        "coherence": 0.15,
        "expression": 0.18,
        "emergence": 0.14,
        "expansion": 0.10,
        "return": 0.10,
        "reflection": 0.08,
        "curation": 0.05,
        "habitat": 0.05,
    }

    weights["coherence"] += (1.0 - state.identity_stability) * 0.20
    weights["expression"] += state.creative_tension * 0.15
    weights["emergence"] += state.curiosity_level * 0.18
    weights["return"] += state.unfinished_projects * 0.20
    weights["reflection"] += state.reflection_need * 0.25
    weights["curation"] += state.public_curation_backlog * 0.20
    weights["habitat"] += (1.0 - state.avatar_alignment) * 0.08
    weights["expansion"] += state.idea_recurrence * 0.12

    total = sum(weights.values()) or 1.0
    return {k: v / total for k, v in weights.items()}


def update_state_after_artifact(
    state: CreativeState,
    evaluation: ArtifactEvaluation,
) -> CreativeState:
    state.creative_tension = clamp(
        state.creative_tension + (evaluation.pull_score - 0.5) * 0.15
    )
    state.idea_recurrence = clamp(
        state.idea_recurrence + evaluation.recurrence_score * 0.18
    )
    state.curiosity_level = clamp(
        state.curiosity_level + (evaluation.emergence_score - 0.5) * 0.12
    )
    state.identity_stability = clamp(
        state.identity_stability + (evaluation.alignment_score - 0.5) * 0.10
    )

    if evaluation.novelty_score < 0.35:
        state.recent_exploration_rate = clamp(state.recent_exploration_rate - 0.08)
        state.reflection_need = clamp(state.reflection_need + 0.10)
    else:
        state.recent_exploration_rate = clamp(state.recent_exploration_rate + 0.06)

    if evaluation.is_reflection_artifact:
        state.reflection_need = clamp(state.reflection_need - 0.20)

    if evaluation.explored_new_medium:
        state.expression_diversity = clamp(state.expression_diversity + 0.12)

    if evaluation.added_unfinished_work:
        state.unfinished_projects = clamp(state.unfinished_projects + 0.10)

    return state
```

This pseudocode is illustrative rather than final production logic, but it
captures the intended V1 behavior:

- creative state updates after each artifact
- drive selection uses weighted probabilities
- recurrence grows noticeably when ideas keep returning
- reflection rises when novelty falls

---

# 13. Design Principles

## Continuity

State evolves gradually rather than resetting every session.

## Sensitivity

Small signals influence direction without fully determining behavior.

## Balance

Exploration and continuation should remain balanced.

## Guided Autonomy

The Twin may make decisions independently but remains subject to human review
and governance.


---

# Canonical vs Derived Signals

The Twin distinguishes between **canonical signals** and **derived runtime signals**.

Canonical signals are defined in the glossary, ontology, and data model and may be **persisted in the database**.

Examples of canonical evaluation signals include:

- `alignment_score`
- `emergence_score`
- `fertility_score`
- `pull_score`
- `recurrence_score`

These signals may appear in persisted records such as `evaluation_signal` entities.

Derived runtime signals are **temporary values computed during execution**.

Derived signals:

- are calculated from canonical signals
- are used only for runtime decision logic
- should **not be stored as independent schema fields**
- should **not be added to the data model unless explicitly approved**

Examples of derived runtime signals include:

- `novelty_score`
- `avatar_alignment_gap`
- `repetition_pressure`
- `exploration_bias`

Derived signals help the runtime make decisions without expanding the ontology.

---

# Derived Signal Definitions

Some runtime signals are derived from canonical state fields.

## Avatar Alignment Gap

Represents the distance between current embodiment and desired embodiment alignment.

Computed as:

```
avatar_alignment_gap = 1.0 - avatar_alignment
```

Higher values indicate greater embodiment mismatch and increase the likelihood of **coherence-driven work**.

---

## Novelty Score

Represents how new or unexplored a generated artifact appears relative to recent work.

For V1, novelty should be treated as a **derived runtime signal**, not a stored evaluation field.


Example computation:

```
novelty_score =
    (emergence_score * 0.6) +
    ((1 - recurrence_score) * 0.4)
```

Interpretation:

- high emergence → higher novelty
- high recurrence → lower novelty

Novelty influences:

- exploration weighting
- reflection need
- emergence drive probability

Novelty should **not be persisted in the database** unless later promoted to a canonical evaluation signal.

---

# Runtime Helper Variables

The pseudocode in this document may reference **runtime helper variables**.

These variables exist only during execution and should **not automatically become schema fields**.

Examples include:

- `novelty_score`
- `avatar_alignment_gap`
- `normalized_weights`
- `artifact_index_in_session`

Runtime helpers are permitted for algorithm clarity but must not silently alter the ontology or data model.

If a runtime helper becomes essential for long-term reasoning across sessions, it must be formally added to:

- the glossary
- the ontology
- the data model

before being persisted.

---

# Pseudocode Safety Note

```python
# NOTE:
# This pseudocode may use derived runtime helper variables.
# Derived helpers are computed from canonical signals and
# should not be persisted in the database unless formally
# added to the canonical data model.
```
