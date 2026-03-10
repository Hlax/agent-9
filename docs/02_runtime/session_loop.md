# Session Loop

This document defines the **runtime execution loop** used by the Twin during creative sessions.

It connects the systems defined in:

- `system_architecture.md`
- `creative_state_model.md`
- the ontology and data model

The session loop describes **how the Twin moves from state → decision → artifact → evaluation → memory update**.

The goal is to produce artifacts while evolving identity, ideas, and creative direction over time.

---

# Watchouts

## Idea Thread Explosion

Autonomous creative systems naturally favor novelty and may create new idea threads too frequently.

If unchecked, this can lead to large numbers of low-development threads that dilute recurrence signals and reduce meaningful continuation of ideas.

Runtime implementations should discourage uncontrolled thread creation when the number of low-activity or abandoned threads exceeds a reasonable threshold.

Possible mitigation strategies include:

- biasing toward continuation of existing threads
- prioritizing high-recurrence ideas
- limiting creation of new threads when thread density is high

The system should favor **evolution of existing ideas** rather than constant novelty generation.

---

# 1. Session Overview

A creative session is a bounded period of work in which the Twin:

1. reads current system context
2. evaluates its creative state
3. selects a session mode
4. determines drive weights
5. chooses a project / thread / idea
6. generates artifacts
7. critiques and evaluates artifacts
8. updates memory and lineage
9. records a reflection summary

Sessions may be triggered:

- manually by Harvey
- automatically by the scheduler

---

# 2. Session Triggers

## Manual Sessions

Triggered through the studio interface.

Example flow:

Harvey clicks **Start Session**  
↓  
Twin begins runtime loop  
↓  
Artifacts generated  
↓  
Results staged for review

Manual sessions allow directed exploration.

---

## Scheduled Sessions

Triggered by a runtime scheduler.

Possible schedules:

- hourly exploration
- daily reflection
- archive resurfacing

Scheduled sessions should:

- pause if a manual session is active
- avoid running when review backlog is high

**Always-on extension:** For runtime modes, scheduler behavior, drive/fatigue, and ecology (thread gravity, archive resurfacing, obsession candidates), see `creative_metabolism.md` and `creative_ecology.md`.

---

# 3. Session Initialization

When a session begins the runtime loads:

- active twin identity
- recent sessions
- open projects
- idea threads
- source items
- archive entries
- memory records
- recent artifacts
- latest creative state snapshot

This context forms the **session prompt state**.

---

# 4. Assess Creative State

The runtime computes the current creative state.

Inputs may include:

- recent artifact signals
- recurrence patterns
- unfinished project count
- reflection backlog
- human feedback signals

If a previous session snapshot exists, the runtime begins from that state.

---

# 5. Select Session Mode

Session mode determines the overall direction of work.

Possible modes:

- continue
- return
- explore
- reflect
- rest

Selection is influenced by:

- unfinished projects
- idea recurrence
- reflection need
- exploration rate

Example:

High unfinished projects → `continue`  
High recurrence → `return`  
Low novelty → `explore`  
High reflection need → `reflect`

---

# 6. Compute Creative Drive Weights

The runtime calculates drive probabilities using the creative state model.

Example drives:

- coherence
- expression
- emergence
- expansion
- return
- reflection
- curation
- habitat

Drive weights influence idea selection and artifact generation.

Drives are chosen probabilistically rather than deterministically.

---

# 7. Select Project, Idea Thread, and Idea

Using the selected session mode and drive weights, the runtime selects:

1. a project
2. an idea thread
3. an idea

Selection signals may include:

- recurrence_score
- pull_score
- project priority
- archive signals

If no suitable project exists, the system may create a **new idea thread**.

---

# 8. Medium Selection

The runtime selects a medium appropriate to the idea and creative tension.

Supported mediums:

- writing
- image
- audio
- video
- concept

Medium selection may consider:

- theme type
- narrative tension
- visual exploration
- habitat/system design work

Concept artifacts may include:

- system architecture
- interface ideas
- prompt packets
- implementation instructions

---

# 9. Artifact Generation Cycle

Artifacts are generated one at a time.

Cycle structure:

Generate Artifact  
↓  
Self Critique  
↓  
Evaluation Signals  
↓  
Creative State Update

Sessions may generate **1–3 artifacts**, but may stop earlier if stop-limits trigger.

---

# 10. Self Critique

After generation, the Twin evaluates the artifact.

Critique questions include:

Intent  
What was this artifact attempting to explore?

Strength  
What works well in this artifact?

Originality  
Does the artifact feel derivative or new?

Energy  
Does the artifact feel alive?

Potential  
Does the artifact suggest future exploration?

Medium Fit  
Was the selected medium appropriate?

---

# 11. Evaluation Signals

Evaluation produces structured signals including:

- alignment_score
- emergence_score
- fertility_score
- pull_score
- recurrence_score

These signals influence:

- state updates
- idea recurrence tracking
- archive decisions
- future drive weights

---

# 12. Creative State Update

After evaluation, the runtime updates internal state.

Possible adjustments:

High pull → increase creative tension  
High recurrence → increase return weighting  
Low novelty → increase reflection need  
High unfinished work → increase continuation weighting

State updates occur **after each artifact**.

---

# 13. Stop Limits

The runtime checks stop conditions after each artifact.

Stop conditions include:

- artifact limit reached
- repeated critique signals
- novelty decrease
- loop detection

If triggered the session moves to reflection and closure.

---

# 14. Memory Updates

At the end of each artifact cycle the system may record:

- artifact record
- evaluation signals
- memory record
- idea lineage updates

Archive entries may be created when work pauses.

---

# 15. Idea Lineage Updates

Idea threads evolve through artifact generation.

Possible events:

- extend existing idea
- branch idea thread
- revive archived idea
- create new idea thread

Lineage updates maintain long-term creative continuity.

---

# 16. Session Reflection

When the session ends, the Twin produces a reflection summary.

Reflection may include:

- key ideas explored
- promising directions
- identity signals
- unresolved questions

This reflection becomes a memory record.

---

# 17. Human Review

After session completion, review-eligible artifacts enter Harvey's review flow.

Possible approval actions:
- approve
- approve_with_annotation
- needs_revision
- reject
- archive
- approve_for_publication

Publication is a separate downstream action.
It should not be treated as part of the same approval-state transition.

Human feedback influences future creative decisions, retention, and release choices.

---

# 18. Runtime Pseudocode

```python

def run_session():
    state = load_creative_state()
    context = load_context()

    mode = choose_session_mode(state)
    drives = compute_drive_weights(state)

    artifacts_generated = 0

    while not stop_limit_triggered():

        project, thread, idea = select_idea(context, state, drives)
        medium = choose_medium(idea, state)

        artifact = generate_artifact(idea, medium)

        critique = self_critique(artifact)
        evaluation = evaluate_artifact(artifact, critique)

        state = update_creative_state(state, evaluation)

        save_artifact(artifact, evaluation)
        update_memory(artifact, evaluation)

        artifacts_generated += 1

        if artifacts_generated >= 3:
            break

    reflection = generate_session_reflection()
    save_session(reflection)
```

---

# 19. Design Principles

The session loop follows several guiding principles:

Exploration before optimization  
The Twin should prioritize discovery.

State-driven behavior  
Creative decisions are guided by internal state rather than randomness.

Human-guided evolution  
Harvey curates outcomes and influences system learning.

Continuity across sessions  
Ideas evolve over time rather than resetting each generation.

