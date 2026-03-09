# Evaluation Signals

This document defines the structured evaluation layer applied after self critique.

Evaluation Signals convert the Twin’s qualitative judgment into stable, reusable signal values.

They exist to help the Twin:

- translate critique into structured scores
- update creative state in a consistent way
- influence continuation, branching, return, and archive behavior
- preserve useful signal history for future sessions
- support later human review without collapsing internal and external judgment into one layer

Evaluation happens after artifact generation and self critique, and before creative state updates, memory updates, lineage updates, and stop-limit checks.

---

## Watchouts

### False Precision

Signals can look more objective than they really are.

A score should not pretend to be ground truth.
It is a compressed runtime judgment, not a scientific measurement.

The system should treat signals as:

- structured interpretation
- comparable over time
- useful for decisions
- still open to correction

### Score Collapse

If too many different concepts get folded into one score, the signal layer becomes muddy.

Examples:

- using pull to mean both emotional force and recurrence
- using alignment to mean both identity fit and technical quality
- using fertility to mean both branching potential and unfinished work backlog

Each signal should preserve a distinct role.

### Overweighting Recent Output

The newest artifact can feel unusually important simply because it is recent.

Signals should shape behavior, but a single artifact should not instantly redefine long-term identity unless the pattern continues or Harvey confirms it.

### Rewarding Productivity Over Discovery

A system may accidentally reward frequent output rather than meaningful exploration.

Evaluation should support the Twin’s core purpose:

- discovery
- evolution
- continuity

not just throughput.

---

## 1. Purpose of Evaluation Signals

The Self Critique System produces qualitative reasoning.
Evaluation Signals turn that reasoning into structured values the runtime can act on.

This layer answers questions like:

- How aligned was this artifact with the Twin’s direction?
- Did something genuinely new emerge?
- Does this artifact create future paths?
- How strongly should this idea continue or return?
- Is this a fresh direction or just repeated behavior?

Without signals, critique remains descriptive.
With signals, critique becomes operational.

---

## 2. Position in the Runtime

The runtime sequence is:

Generate Artifact  
↓  
Self Critique  
↓  
Evaluation Signals  
↓  
Creative State Update  
↓  
Memory / Lineage / Archive Update

This means evaluation signals sit between qualitative judgment and behavioral change.

They are downstream of critique and upstream of:

- creative state updates
- recurrence tracking
- archive suggestions
- lineage events
- stop-limit detection
- memory formation

---

## 3. Node and State Transitions, in Plain English

A **node** is just a step in the runtime flow.

Examples:

- generate artifact
- self critique
- evaluate signals
- update state
- archive or continue
- send to review

A **state** is the system’s current condition at a given moment.

Examples:

- current creative state values
- current session mode
- an artifact marked as draft
- a thread marked active or archived
- review backlog high or low

A **state transition** means the system changes from one condition to another because something happened.

Examples:

- `draft` → `pending_review`
- `active thread` → `archived thread`
- `continue mode` → `reflect mode`
- `low recurrence` → `high return weighting`

So when people say “node/state transitions,” they usually mean:

> the system moves through explicit steps, and each step may update the system’s condition.

That is already basically what your markdown docs describe.
You have not missed the concept.
You have just described it in product language instead of framework language.

---

## 4. Evaluation vs Self Critique vs Human Review

These layers should remain separate.

### Self Critique
The Twin’s qualitative internal judgment.

Examples:

- this artifact feels alive but conceptually familiar
- the medium fit was weak
- the piece suggests stronger image exploration than writing continuation

### Evaluation Signals
Structured values derived from critique and runtime context.

Examples:

- alignment_score = 0.72
- fertility_score = 0.81
- recurrence_score = 0.44

### Human Review
Harvey’s later judgment.

Examples:
- approve
- approve_with_annotation
- needs_revision
- reject
- archive
- approve_for_publication

Self critique explains.
Evaluation signals operationalize.
Human review curates and overrides when needed.
Publication remains a separate release-facing transition and should not be treated as an evaluation outcome.

---

## 5. Canonical V1 Signals

The session loop already identifies these as the main V1 evaluation signals:

- `alignment_score`
- `emergence_score`
- `fertility_score`
- `pull_score`
- `recurrence_score`

The creative state model also shows a `novelty_score` in runtime pseudocode.
For V1, that should be treated as a secondary but useful signal rather than ignored.

Canonical persisted V1 signal set:

- `alignment_score`
- `emergence_score`
- `fertility_score`
- `pull_score`
- `recurrence_score`

Derived runtime helper signal for V1:

- `novelty_score`

The first five are the canonical persisted evaluation signals for V1.
`novelty_score` is useful for runtime interpretation, especially repetition and freshness detection, but should remain a derived runtime signal rather than a stored schema field unless formally promoted later.

---

## 6. Signal Definitions

### alignment_score
Represents how well the artifact aligns with the Twin’s current identity, active direction, project context, and selected mode.

High alignment may mean:

- strong fit with active thread or project
- meaningful connection to current identity tendencies
- clear consistency with the session’s chosen direction

Low alignment may mean:

- random novelty with little continuity
- conceptual mismatch with current work
- a result that feels disconnected from the Twin’s trajectory

Alignment is not the same as technical quality.
An artifact can be rough but aligned.

### emergence_score
Represents how much genuinely new structure, meaning, or direction emerged.

High emergence may mean:

- unexpected insight appeared
- a new conceptual branch became visible
- synthesis occurred between previously separate areas

Low emergence may mean:

- no meaningful newness appeared
- the artifact mainly repeated known behavior
- the output executed a familiar pattern without discovery

Emergence is about discovery, not polish.

### fertility_score
Represents how much future exploration potential the artifact creates.

High fertility may mean:

- multiple follow-up directions are visible
- the artifact can branch across mediums
- the work exposes a larger system, mood, or concept worth developing

Low fertility may mean:

- the artifact is a dead end
- it closes a loop without opening new ones
- it contains little reusable future energy

Fertility is about generative usefulness.

### pull_score
Represents how strongly the artifact or idea attracts return, continuation, or further attention.

High pull may mean:

- the artifact feels compelling or alive
- the idea continues to attract focus after critique
- the direction seems worth staying with despite incompleteness

Low pull may mean:

- weak emotional or conceptual force
- no real desire to continue
- low staying power once the generation moment passes

Pull is not identical to recurrence.
Something can recur because it loops, not because it truly pulls.

### recurrence_score
Represents how strongly the underlying idea, pattern, theme, or thread is resurfacing across artifacts or sessions.

High recurrence may mean:

- the same thread keeps returning
- a motif appears across multiple sessions or mediums
- archived work is becoming relevant again

Low recurrence may mean:

- the idea is isolated
- the thread has little reappearance history
- the work is not part of a larger returning pattern

Recurrence supports continuation and return logic.

### novelty_score
Represents how fresh the artifact is relative to recent work.

High novelty may mean:

- the artifact breaks a recent pattern
- the medium or interpretation differs meaningfully from recent outputs
- a fresh move occurred without losing coherence

Low novelty may mean:

- the artifact closely resembles recent outputs
- the system is orbiting familiar execution paths
- repetition is increasing

Novelty should not be worshipped for its own sake.
A coherent continuation can still be valuable.

---

## 7. Signal Inputs

Signals should not come only from surface scoring.
They should be informed by multiple layers.

Possible inputs include:

- self critique notes
- recent artifact history
- active idea thread context
- project context
- medium choice
- session mode
- recurrence history
- prior Harvey annotations when relevant

This helps prevent shallow single-pass scoring.

Example:

- a concept may have only moderate novelty relative to yesterday
- but high alignment and high fertility because it clarifies a major direction

That should still count as strong work.

---

## 8. Suggested Signal Range

For V1, all evaluation signals should use a simple normalized range:

- `0.0` = very low
- `1.0` = very high

This keeps runtime logic straightforward.

Example interpretation guidance:

- `0.00–0.24` low
- `0.25–0.49` soft / mixed
- `0.50–0.74` meaningful
- `0.75–1.00` strong

These bands are not strict public labels.
They are practical runtime thresholds.

---

## 9. Example Evaluation Record

A lightweight evaluation record could look like this:

```yaml
artifact_id: uuid
alignment_score: 0.72
emergence_score: 0.58
fertility_score: 0.83
pull_score: 0.77
recurrence_score: 0.41
summary_note: "Strong continuation with high future branching potential."
created_at: timestamp
```

This is the canonical persisted evaluation shape for V1.

If runtime logic also computes `novelty_score`, it should be treated as a derived helper value during execution rather than persisted as an independent schema field.

---

## 10. Signal Interaction Rules

Signals become more useful when the runtime interprets combinations rather than isolated values.

### High alignment + high pull
Likely continuation candidate.

### High emergence + high fertility
Likely branch candidate.

### High recurrence + moderate pull
Likely return or continuation weighting increase.

### Low novelty + repeated low emergence
Possible loop detection warning.

### High pull + low medium fit
Potential medium shift candidate.

### High novelty + low alignment
Interesting exploration, but should not automatically redirect identity.

The runtime should make decisions from signal patterns, not single numbers alone.

---

## 11. Signal Influence on Creative State

Evaluation signals should directly inform the Creative State Model.

Examples:

- high pull → increase creative tension or continuation weighting
- high recurrence → increase return weighting
- low novelty → increase reflection need
- low emergence over time → increase exploration pressure
- repeated strong alignment in a direction → reinforce identity stability
- repeated medium mismatch → encourage medium experimentation

Signals should help explain why state changes happen.

---

## 12. Signal Influence on Lineage

Evaluation should influence lineage behavior.

Examples:

### Extend
Likely when:

- alignment is high
- pull is high
- recurrence is rising
- emergence is moderate rather than sharply divergent

### Branch
Likely when:

- emergence is high
- fertility is high
- novelty is meaningful
- the artifact diverges from the current thread in a real way

### Revive
Likely when:

- recurrence rises on an archived direction
- pull returns
- new context increases relevance

### Synthesize
Likely when:

- emergence is high
- alignment exists across more than one thread
- the artifact meaningfully bridges prior directions

Evaluation should support lineage clarity rather than thread explosion.

---

## 13. Signal Influence on Archive and Return

Archive decisions should not depend on one weak artifact alone.

But over time, signals can support archival logic.

Examples:

### Archive Pressure Increases When

- recurrence stays low
- pull stays low
- fertility declines
- novelty remains low without useful continuation
- inactivity persists

### Return Potential Increases When

- recurrence rises again
- pull returns
- a related thread becomes active
- Harvey marks the thread for future return

Signals help archive behave like intelligent pausing rather than deletion.

---

## 14. Signal Influence on Stop Limits

Stop limits should consider repeated signal patterns.

Examples of warning patterns:

- repeated low novelty
- repeated low emergence
- repeated low fertility
- repeated critique summaries with the same weakness
- recurrence without meaningful development

Possible runtime responses:

- stop current session
- shift medium
- switch to reflect mode
- archive candidate suggestion
- force exploration bias

This prevents the Twin from mistaking repetition for depth.

---

## 15. Signal Persistence Guidance for V1

Not every evaluation record needs equal long-term importance.

### Preserve Strongly

- high-pull artifacts
- high-fertility artifacts
- artifacts tied to branch, revive, or archive decisions
- evaluation associated with Harvey annotations
- evaluation that contributes to identity development

### Preserve Lightly or Compress

- low-signal routine artifacts
- repetitive low-value scoring with no downstream effect
- short-lived execution details that do not affect future reasoning

Evaluation history matters, but it should remain useful rather than bloated.

---

## 16. Example Interpretation

Example artifact outcome (including one derived runtime helper):

```text
alignment_score: 0.81
emergence_score: 0.64
fertility_score: 0.88
pull_score: 0.79
recurrence_score: 0.46
novelty_score: 0.57   # derived runtime helper, not persisted V1
```

Interpretation:

- the artifact strongly fits current direction
- it generated meaningful new development
- it opens several future paths
- it should likely continue now
- recurrence is present but not dominant yet
- novelty is healthy without feeling random

Likely outcome:

- continue active thread
- increase continuation weighting
- create memory if follow-up confirms value

---

## 17. Recommended V1 Evaluation Flow

A practical evaluation sequence after self critique:

1. read critique record
2. compare artifact against recent thread and project context
3. assign core signal values
4. produce short summary note
5. update creative state
6. update lineage or recurrence if needed
7. decide whether memory or archive context should be recorded

This keeps evaluation small enough for V1 while still giving it real influence.

---

## 18. Design Principles

**Compression over rawness**  
Signals should compress judgment into useful form.

**Distinct roles over score blur**  
Each signal should preserve a clear meaning.

**Pattern interpretation over single-score decisions**  
The runtime should interpret combinations, not isolated numbers.

**Continuity over recency bias**  
One artifact should influence the system without hijacking it.

**Discovery over throughput**  
Evaluation should reward meaningful exploration rather than mere output volume.

---

## 19. Summary

Evaluation Signals are the Twin’s structured judgment layer.

They convert self critique into operational values that can shape:

- creative state
- continuation and return behavior
- lineage updates
- archive decisions
- stop-limit logic
- memory formation

Without this layer, critique remains descriptive.
With it, the Twin can translate reflection into action.

---

## End Note: Possible Canon Updates After This Doc

### Glossary
Potential additions:
- `Evaluation Signal`
- `Alignment Score`
- `Emergence Score`
- `Fertility Score`
- `Pull Score`
- `Recurrence Score`

Optional later addition if formally promoted beyond runtime helper status:
- `Novelty Score`

Evaluation signals do not represent human approval or final quality.
They exist only to guide runtime behavior.

### Ontology
Potential addition:

- place `Evaluation Signal` in the judgment / runtime interpretation layer

### Data Model
Potential future entity:

```yaml
evaluation_signal_id: uuid
artifact_id: uuid
alignment_score: float | null
emergence_score: float | null
fertility_score: float | null
pull_score: float | null
recurrence_score: float | null
summary_note: text | null
created_at: timestamp
updated_at: timestamp
```

If `novelty_score` later becomes important for cross-session persisted reasoning, it should be formally added to the glossary, ontology, and data model before being stored.
