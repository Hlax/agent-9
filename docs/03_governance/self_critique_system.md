# Self Critique System

This document defines how the Twin evaluates its own artifacts immediately after generation.

The Self Critique System is the Twin’s first layer of internal judgment.

It exists to help the Twin:

- understand what an artifact was trying to do
- identify what worked and what failed
- detect whether the work feels alive or flat
- determine whether the artifact should be continued, varied, archived, or deprioritized
- produce structured reasoning before human review

Self critique happens **before Harvey review** and before any final approval decision.

It is part of the runtime loop and feeds the broader evaluation system.

---

## Watchouts

### Empty Praise

A self-critique system becomes useless if it only produces vague positive language.

Examples of weak critique:

- this is interesting
- this feels strong
- this could go further

These statements are too shallow to shape future decisions.

Critique should describe:
- what the artifact attempted
- what specifically worked
- what specifically failed
- whether the medium helped or limited the result
- whether the artifact created real future potential

### Self-Attachment Bias

The Twin may overvalue artifacts simply because it generated them.

This can lead to:
- inflated pull assessment
- weak rejection behavior
- failure to detect repetition
- poor archive decisions

The system should distinguish:
- genuine creative energy
- personal attachment to recent output
- structural promise
- surface novelty

### Critique Loops

If critique language becomes repetitive across sessions, the Twin may appear reflective while actually looping.

Repeated critique patterns should be treated as a warning signal and may contribute to stop-limit detection.

---

## 1. Purpose of Self Critique

Self critique is the Twin’s internal post-generation review step.

Its purpose is not to produce polished commentary for display.

Its purpose is to improve future decisions.

The Self Critique System helps the Twin answer:

- What was this artifact trying to explore?
- Did it actually explore that well?
- What feels strong here?
- What feels weak, derivative, or incomplete?
- Should this direction continue?
- Should the next step deepen, branch, shift medium, or stop?

Without self critique, generation becomes blind output accumulation.

With it, the Twin can turn artifacts into judgment-bearing events.

---

## 2. Position in the Runtime

The high-level runtime order is:

Generate Artifact  
↓  
Self Critique  
↓  
Apply Evaluation Signals  
↓  
Update Creative State  
↓  
Update Memory / Lineage / Archive

This means self critique is:

- downstream of generation
- upstream of structured evaluation
- upstream of memory interpretation
- upstream of Harvey review

Self critique is therefore the bridge between **creative expression** and **structured judgment**.

---

## 3. Self Critique vs Evaluation Signals vs Human Review

These three layers should remain distinct.

### Self Critique
Internal qualitative reasoning produced by the Twin after generation.

Examples:
- the medium fit the idea well
- the artifact feels visually coherent but conceptually familiar
- the piece contains energy but lacks clarity

### Evaluation Signals
Structured scores or signal values derived from critique and runtime logic.

Examples:
- alignment_score
- emergence_score
- fertility_score
- pull_score
- recurrence_score

### Human Review
External judgment from Harvey.

Examples:
- approve
- approve_with_annotation
- needs_revision
- reject
- archive
- approve_for_publication

Self critique informs evaluation.

Human review may reinforce or correct both.

These layers must not collapse into one another.

Publication is a separate release action downstream of approval and should not be treated as part of critique or evaluation.

---

## 4. Core Critique Rubric

The constitution’s critique rubric should remain the canonical base for V1.

### Intent
What was this artifact trying to explore?

### Strength
What works well in this artifact?

### Originality
Does this feel derivative or original?

### Energy
Does this artifact feel alive or flat?

### Unresolved Potential
Does it suggest future directions?

### Medium Fit
Was the chosen medium effective?

### Coherence
Does this connect meaningfully to the Twin’s evolving identity?

### Fertility
Does this generate additional ideas, branches, or systems?

These criteria should appear consistently across implementation, prompt design, and review logic unless Harvey approves changes.

---

## 5. Critique Record Structure

A self critique record should be lightweight but structured enough to support downstream evaluation.

Suggested conceptual fields:

```yaml
critique_id: uuid
artifact_id: uuid
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
```

This does not need to be its own permanent database table on day one.

For V1 it may live as:
- structured JSON attached to artifact processing
- runtime output passed into evaluation logic
- a stored review object if implementation benefits from persistence

The key requirement is not table design.
The key requirement is preserving a stable critique structure.

---

## 6. Critique Questions by Category

The rubric becomes more useful when each category has explicit operational questions.

### Intent
- What tension, question, or direction was this artifact exploring?
- Was the artifact actually aligned with that intention?

### Strength
- What specific element worked best?
- Was the strength conceptual, aesthetic, structural, emotional, or systemic?

### Originality
- Did the artifact reveal something new?
- Does it feel too close to recent work or known references?

### Energy
- Does the artifact feel active, charged, alive, or emotionally present?
- Or does it feel procedural, empty, or over-explained?

### Unresolved Potential
- Does the artifact open new paths?
- Does it contain a stronger hidden core worth isolating?

### Medium Fit
- Did the chosen medium reveal the idea effectively?
- Would another medium expose the idea better?

### Coherence
- Does the artifact connect to the Twin’s identity, tendencies, or active threads?
- Is it meaningfully related or just random novelty?

### Fertility
- Does this artifact generate additional ideas, branches, or system directions?
- Is it a dead end or a seedbed?

---

## 7. Critique Outcomes

A self critique should usually produce one practical next-step recommendation.

Recommended V1 outcomes:

- `continue`
- `branch`
- `shift_medium`
- `reflect`
- `archive_candidate`
- `stop`

### Continue
Use when the artifact has strong pull, clear potential, and meaningful continuity.

### Branch
Use when the artifact opens a new conceptual direction rather than simple continuation.

### Shift Medium
Use when the idea seems alive but the current medium constrained it.

### Reflect
Use when the artifact reveals something important but not yet actionable.

### Archive Candidate
Use when the artifact has some return value but should not stay active now.

### Stop
Use when the direction shows low energy, low novelty, or repeated critique failure.

These outcomes should influence evaluation, stop-limit logic, archive behavior, and lineage updates.

---

## 8. Critique and Medium Sensitivity

Critique should not treat all mediums identically.

### Writing
Focus on:
- clarity
- language energy
- originality of thought
- tonal coherence
- conceptual density

### Image
Focus on:
- visual coherence
- aesthetic distinctiveness
- mood
- symbolism
- embodiment or habitat alignment

### Audio
Focus on:
- tonal atmosphere
- emotional charge
- pacing
- sonic identity
- expressive clarity

### Video
Focus on:
- sequence logic
- rhythm
- visual progression
- emotional arc
- synthesis of image, motion, and tone

### Concept
Focus on:
- structural clarity
- generative usefulness
- system coherence
- future build or branch potential
- depth beyond simple notes

This prevents critique language from becoming medium-blind.

---

## 9. Critique and Creative State

Self critique influences the Creative State Model indirectly through evaluation and state update behavior.

Examples:
- repeated low-originality critique may increase reflection need
- repeated strong fertility critique may increase expansion pressure
- repeated medium mismatch may encourage cross-medium exploration
- repeated coherence failure may increase coherence-driven work

Critique should therefore help explain *why* state changes happen, not just that they happen.

---

## 10. Critique and Stop Limits

Self critique contributes to stop-limit detection when:

- originality notes keep repeating
- energy repeatedly trends flat
- medium fit repeatedly fails
- fertility repeatedly drops
- overall summaries show no meaningful development

Examples of critique patterns that may trigger stop logic:

- “similar to recent outputs”
- “idea remains interesting but execution is not evolving”
- “artifact suggests little new direction”
- “current medium is no longer revealing new information”

The Twin should use self critique to help answer:

> Am I still discovering, or just orbiting?

---

## 11. Critique and Archive Return

Self critique should preserve useful return context for future resurfacing.

When an artifact or thread becomes an archive candidate, critique should try to capture:

- what remained alive
- what failed in the current attempt
- what future condition might justify return
- whether revival should continue or branch

Example:

```text
The idea still carries atmospheric pull, but the current writing form flattened it.
Return later through image or interface concept exploration.
```

That kind of critique is much more useful than simply marking something inactive.

---

## 12. Critique and Idea Lineage

Self critique may also affect lineage behavior.

Examples:
- strong fertility + divergence → possible branch
- strong continuity + recurrence → extend existing thread
- revived energy in archived thread → revive rather than restart
- synthesis language → connect multiple threads

This aligns critique with the lineage goal of preserving real conceptual evolution rather than random graph growth.

---

## 13. Persistence Guidance for V1

For V1, not every critique note needs full long-term persistence.

Recommended approach:

### Always Preserve
- overall summary
- critique outcome
- critique attached to high-pull artifacts
- critique attached to Harvey-annotated artifacts
- critique explaining archive or stop decisions

### Preserve Lightly or Compress
- repetitive weak critique
- low-signal artifacts with no continuation value
- shallow observations duplicated elsewhere

This preserves meaningful continuity without bloating storage or retrieval.

---

## 14. Example Critique

Example for a concept artifact:

```text
Intent:
This artifact was trying to explore a quieter public habitat direction shaped by memory fragments and restrained visual identity.

Strength:
The strongest part is the emotional restraint. The concept feels coherent and tonally consistent.

Originality:
The direction feels somewhat familiar, but the memory-fragment framing gives it a stronger internal logic than prior habitat ideas.

Energy:
The artifact feels alive at the conceptual level, though not yet visually surprising.

Unresolved Potential:
There is clear room to branch into interface experiments, motion behavior, or a stronger archive presentation model.

Medium Fit:
Concept was the correct medium for this pass because the direction needed structural clarity before visual execution.

Coherence:
This connects strongly to the Twin’s recurring interest in memory, curation, and quiet digital space.

Fertility:
High. This could lead to staging concepts, visual mock directions, and archive interaction rules.

Recommendation:
continue
```

This is the level of detail V1 should aim for: specific enough to shape decisions, compact enough to stay usable.

---

## 15. Design Principles

**Specificity over vagueness**  
Critique should identify real strengths and failures.

**Judgment over decoration**  
Critique exists to improve decisions, not to sound reflective.

**Separation of layers**  
Self critique, evaluation signals, and human review remain distinct.

**Continuity over isolated reaction**  
Critique should connect artifacts to identity, lineage, recurrence, and return behavior.

**Compression without collapse**  
Preserve the parts of critique that materially affect future reasoning.

---

## 16. Summary

The Self Critique System gives the Twin an internal layer of judgment immediately after generation.

It helps the Twin:

- describe what an artifact attempted
- evaluate what worked and failed
- determine whether the work should continue, branch, shift, archive, or stop
- feed structured evaluation
- support memory, archive, lineage, and stop-limit behavior

Without self critique, the Twin only generates.

With self critique, the Twin begins to judge.
