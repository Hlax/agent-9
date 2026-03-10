# Creative Ecology (Phase 2)

This document adds an **ecology** layer above the creative metabolism: how projects, threads, archive items, and recurring directions **compete for attention** in an always-on runtime.

It builds on:

- `creative_metabolism.md` — runtime modes, scheduler, drive/fatigue, studio controls
- `creative_state_model.md` — state fields, drive weights, session mode
- `archive_and_return.md` — archival, resurfacing, return behavior
- `idea_lineage.md` — threads, recurrence, conceptual continuity

**Constraint:** Do not change the meaning of archive, lineage, evaluation, or approval. Ecology influences *which* project/thread/idea gets chosen and *when* archived work resurfaces; it does not auto-approve or bypass governance.

---

## 1. Goal

Build a higher-level **ecology engine** that governs how:

- projects and threads exert “gravity” on the runtime
- archived threads resurface for consideration
- multiple directions (continue, return, explore, reflect, rest) compete
- long-term “obsession” candidates are identified and weighted

This layer sits above metabolism: the scheduler uses both metabolism (drive, fatigue) and ecology (gravity, resurfacing, competition) to decide when to run a session and what context to pass.

---

## 2. Thread gravity

Each **active project or thread** should exert pressure on the runtime based on:

- **recurrence** — how often this thread appears in recent signals
- **pull** — evaluation pull_score and creative_pull
- **fertility** — evaluation fertility_score and critique
- **unfinished status** — work in progress
- **Harvey annotations** — explicit feedback or annotations
- **archive return potential** — relevance to recently active or resurfacing threads
- **recent inactivity** — “hasn’t been chosen in a while” can increase pressure
- **obsession pressure** — sustained pull + recurrence + fertility (see §5)
- **source / identity alignment** — alignment with current identity and referenced source items (the same identity and source context that already feed session generation). Threads or directions that match identity/sources get a gravity boost so the ecology ranks them consistently with what the Twin “is” and what it’s referencing.

The ecology engine should compute a **gravity** (or attention weight) per project/thread and feed it into the existing “select project / thread / idea” step so the Twin does not only pick the latest idea.

---

## 3. Archive resurfacing

Archived threads should occasionally **re-enter consideration** through:

- **recurrence increase** — signals suggest the idea is resurfacing
- **related active thread activity** — an active thread touches similar themes
- **human annotations** — Harvey marks something for return or revisit
- **random low-frequency rediscovery** — optional, low probability
- **unresolved potential** — strong past pull that was never fully executed

This aligns with `archive_and_return.md`: the archive is not a graveyard; resurfacing is part of long-horizon continuity.

The ecology layer should output **resurfacing candidates** (e.g. thread IDs + rationale) that the scheduler or session runner can use when choosing “return” mode or when selecting a project/thread.

---

## 4. Competition between directions

The runtime should **compare** multiple live pressures instead of picking the latest idea:

- **continue** active work (high gravity on current thread)
- **return** to archived work (resurfacing candidates)
- **explore** new territory (curiosity pressure, low recurrence)
- **reflect** on patterns (reflection pressure)
- **rest** (fatigue, or explicit rest mode)

Competition can be implemented as a small decision step that takes:

- metabolism signals (drive, fatigue, curiosity_pressure, reflection_pressure, unresolved_pull, obsession_pressure)
- ecology signals (per-thread gravity, resurfacing candidates, review backlog)
- environmental pressure (token/compute budget, active runtime mode)

and outputs a **direction** (continue | return | explore | reflect | rest) plus an optional **target** (project/thread/idea or archive entry). The existing `computeSessionMode` and drive/thread selection can then be informed by this output.

---

## 5. Obsession candidates

If a thread repeatedly shows:

- high **pull**
- high **fertility**
- rising **recurrence**
- **cross-session return** (chosen again after pause or archive)

the system may treat it as a **persistent obsession candidate**.

**Obsession** should:

- increase continuation weighting for that thread
- increase return likelihood if archived
- increase branch probability (new branches from the same thread)
- remain constrained by novelty and stop-limit checks

**Obsession must not** mean runaway looping: stop limits, critique patterns, and low-novelty detection still apply (see `creative_metabolism.md`).

The ecology engine can maintain a **list or score of obsession candidates** (e.g. thread_id + obsession_score) and feed it into gravity and resurfacing so the Twin can develop “creative obsessions” that are still governed.

### 5.1 Near-eligible concept boost (optional)

Concept artifacts that are **just under** the proposal-eligibility threshold (e.g. fertility 0.65 vs 0.70) may receive a small **continuation or return** weight so the next session is slightly more likely to revisit that thread and push it over. This is a soft nudge only; the eligibility threshold itself does not change. See `concept_to_proposal_flow.md`.

---

## 6. Environmental pressure

The ecology should also consider:

- **review backlog** — many unreviewed artifacts may increase reflection pressure or slow new generation
- **proposal backlog** — count of pending surface/system proposals (pending_review, approved_for_staging); high backlog can bias competition toward reflect or reduce weight for “generate new concept” (see `creative_metabolism.md` §3.6)
- **staging / implementation pressure** — proposals in `approved_for_staging` (or staged, awaiting Harvey review). When staging backlog is high, the engine may prefer **reflect** or prioritize a “build in staging” / implementation step over starting brand-new concept sessions; in Mode B (proposal + staging build), the scheduler can use this to choose “implement next approved proposal” vs “generate another artifact”
- **token budget** — already in metabolism; can cap how many “candidates” are evaluated
- **compute budget** — same
- **public curation backlog** — from creative state
- **active runtime mode** — Default / Slow / Steady / Turbo (affects how aggressively to act on gravity and resurfacing)

These are inputs to the ecology decision, not new approval or publication rules.

---

## 7. Suggested architecture (for implementation planning)

- **ecology_engine.ts** — computes thread gravity, resurfacing candidates, obsession candidates, and a “competition” result (direction + target)
- **session_runner** (existing or extended) — calls ecology engine and passes result into existing pipeline (state → drive → mode → project/thread/idea → generate → …)

Scheduler (from metabolism) then:

1. Updates metabolism
2. Updates ecology (gravity, resurfacing, obsession, competition)
3. Checks limits
4. If “trigger session” and direction/target from ecology, runs session with that context

---

## 8. Studio UI (ecology)

- **Ecology panel** (read-only or diagnostic):
  - top active projects/threads by gravity (including source/identity alignment where computed)
  - archive resurfacing candidates
  - obsession candidates
  - review backlog pressure
  - proposal backlog and staging backlog (optional)

Can be combined with the metabolism panel and activity log in a single “Runtime” or “Always-on” section in Studio.

---

## 9. Database / state model

- Prefer **derived** values for gravity, resurfacing list, obsession candidates (computed from existing artifact, thread, evaluation, archive tables).
- If persistence is needed (e.g. “last resurfacing check,” “obsession candidate cache”), use minimal extra tables or config; do not overload canonical artifact/thread/archive semantics.

---

## 10. Implementation order (Phase 2)

1. Implement **thread gravity** from existing recurrence, pull, fertility, unfinished state, and annotations.
2. Implement **archive resurfacing** logic using recurrence, related-thread activity, and unresolved potential; output resurfacing candidates.
3. Implement **obsession candidate** detection (pull + fertility + recurrence + cross-session return) and feed into gravity and resurfacing.
4. Implement **competition** step: combine metabolism + ecology + environment → direction + target; wire into session runner.
5. Add **ecology panel** in Studio (and any activity log entries for resurfacing/obsession events).

Phase 1 (metabolism, scheduler, modes, studio controls) should be in place first so the scheduler can call the ecology engine at the right time.
