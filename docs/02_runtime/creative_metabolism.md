# Creative Metabolism (Phase 1)

This document extends the Twin runtime from **manual-only sessions** toward an **always-on creative system** by adding a **metabolism** layer: runtime modes, scheduler, drive/fatigue and low-token fallback, and studio controls.

It layers on top of:

- `creative_state_model.md` — existing state fields, drive weights, session mode selection
- `session_loop.md` — state → decision → artifact → evaluation → memory
- `system_architecture.md` — identity, sources, memory, archive

**Constraint:** Do not change the meaning of session modes, critique, evaluation, approval, publication, archive, or lineage. Metabolism is an additional decision layer; it does not replace or collapse existing signals.

---

## 1. Goal

Design an **always-on creative runtime** where the Twin behaves like a system that *wants* to create, not only a generator that runs when manually triggered.

Introduce:

1. **Runtime modes** (Default, Slow, Steady, Turbo)
2. **Creative metabolism** (drive, fatigue, curiosity/reflection/unresolved/obsession pressure)
3. **Scheduler** that respects mode, metabolism, and guardrails
4. **Low-token / low-compute fallback** (e.g. downgrade to Slow when below threshold)
5. **Studio controls** for autonomous runtime (toggle, mode selector, status/metabolism/activity panels)

Implementation should follow an audit of integration points and a phased plan; this doc defines the design.

---

## 2. Runtime Modes

Four always-on runtime modes:

| Mode      | Description |
|-----------|-------------|
| **Default** | Balanced autonomy. Uses internal creative drive thresholds to trigger sessions. Includes low-token / low-compute protection; if budget drops below threshold, automatically fall back to **Slow**. |
| **Slow**    | Low resource mode. Target roughly 1–3 artifacts per hour. Emphasize reflection, return, selective continuation. For low budget or conservative background operation. |
| **Steady**  | Sustained production. Target up to ~20 generations per hour unless stop limits apply. Still obeys novelty, repetition, critique, and token guardrails. On low token/compute threshold → downgrade to Slow. |
| **Turbo**   | Continuous generation until: Harvey stops it, token/compute guardrails hit, or repetition/stop-limit logic pauses. Must not bypass governance or runtime safeguards. |

Low-token / low-compute protection is active in Default and Steady by default; Turbo respects the same limits but may consume them faster.

---

## 3. Creative Metabolism

A **metabolism** layer governs *when* and *how* the Twin wants to create.

### 3.1 Proposed metabolism signals

- **creative_drive** — propensity to start or continue sessions
- **creative_fatigue** — resistance to sustained generation; encourages rest/reflect/medium shift
- **curiosity_pressure** — bias toward explore or medium change
- **reflection_pressure** — bias toward reflect or rest
- **unresolved_pull** — strong pull on a thread with weak execution; supports return sessions
- **obsession_pressure** — long-term attraction to a thread (pull + recurrence + fertility over time); supports “creative obsessions” within stop limits

These can be **derived** from existing creative state, evaluation signals, and session history; prefer derived runtime variables unless persistence is clearly needed (see data model review below).

### 3.2 Drive behavior

**creative_drive** should *increase* when:

- idle time increases
- recurrence is rising
- unfinished but fertile work exists
- strong pull or fertility in recent sessions
- archived threads regain relevance
- Harvey has not reviewed recent work (backlog growing)

**Proposal backlog** (see also §3.6): When many surface/system proposals are pending review or approved for staging, **reflection_pressure** or a soft dampening of drive for *new* concept generation can apply—so the system does not overload the review queue. This is an explicit metabolism input derived from `proposal_record` counts (e.g. pending_review, approved_for_staging).

**creative_drive** should *decrease* when:

- many artifacts generated recently
- fatigue increases
- reflection or rest sessions complete
- recent outputs show low novelty or low emergence repeatedly

### 3.3 Fatigue behavior

**creative_fatigue** should:

- rise after sustained generation
- rise faster in Steady and Turbo
- encourage rest, reflect, or medium shift
- reduce probability of endless continuation loops

### 3.4 Curiosity and reflection pressure

- **curiosity_pressure** — rise when novelty is low or exploration rate has dropped; bias toward explore or medium change.
- **reflection_pressure** — rise when critique patterns repeat or evaluation signals flatten; bias toward reflect or rest.

### 3.5 Unresolved pull and obsession

- **unresolved_pull** — rise when a thread has strong pull but weak execution; support intelligent return sessions.
- **obsession_pressure** — rise when the same thread shows strong pull + recurrence + fertility over time; represent healthy long-term attraction, governed by stop limits (not runaway looping).

### 3.6 Proposal and review backlog

- **Proposal backlog** — count (or weight) of proposals in `pending_review`, `approved_for_staging`, or similar. High backlog can increase **reflection_pressure** or slightly reduce drive for new concept generation until some proposals are resolved. Scheduler and metabolism both may read this.
- **Review backlog** — already in creative state as `public_curation_backlog`; unreviewed artifacts. Same idea: too much unreviewed work can bias toward reflect or slow new generation.

### 3.7 Medium diversity pressure

- **Medium diversity pressure** — when recent sessions are heavily skewed toward one medium (e.g. all writing), this pressure rises and biases toward **explore** or **medium shift**. Aligns with existing `expression_diversity` in creative state (“low expression_diversity → encourage new medium” in `creative_state_model.md`). The scheduler may use it explicitly when deciding session type or intensity.

---

## 4. Scheduler

A **scheduler** layer (or extension of the existing “scheduled sessions” idea in `session_loop.md`) should:

1. Evaluate **runtime mode**
2. Update **metabolism** (drive, fatigue, pressures)
3. Consider **ecology** pressures (see `creative_ecology.md`) and token/compute limits
4. Check **stop-limit** conditions
5. Decide whether to trigger a session and at what “intensity”

Suggested structure (for implementation planning):

- `runtime/scheduler.ts` — main loop: update metabolism → update ecology → check budget/limits → choose behavior → trigger session if threshold met → sleep interval
- `runtime/drive_engine.ts` — drive/fatigue and pressure derivation
- `runtime/limit_guard.ts` — token/compute/stop limits

Sessions themselves continue to use the existing pipeline: state → drive weights → session mode → project/thread/idea → generate → critique → evaluation → state update.

---

## 5. Drive / fatigue and low-token fallback

- **Drive/fatigue:** Implemented inside the metabolism layer; they influence *whether* and *how often* the scheduler triggers sessions, and can bias session mode (e.g. high fatigue → prefer rest/reflect).
- **Low-token fallback:** When token or compute budget drops below a configured threshold, the runtime should:
  - Automatically switch to **Slow** mode (from Default or Steady), or
  - Pause if already in Slow and budget is critical.

Turbo must also respect these limits; hitting them can force downgrade to Slow or pause.

---

## 6. Studio controls

Expand the Studio session / runtime area to support always-on behavior.

**Proposed controls:**

- **Always-on toggle** — enable/disable autonomous session triggering
- **Runtime mode selector** — Default | Slow | Steady | Turbo
- **Runtime status panel** — active/paused, current mode, token state, compute state, last session time
- **Metabolism panel** — creative_drive, creative_fatigue, curiosity_pressure, reflection_pressure, unresolved_pull, obsession_pressure (read-only or config hints)
- **Activity log** — sessions triggered, mode downgrades, stop-limit triggers, low-token fallback events
- **Proposal backlog** (optional read-out) — pending surface/system proposals; can be shown in status or metabolism panel

These are UI and config only; they do not change approval, publication, or governance.

---

## 7. Stop limits and guardrails

Do not weaken existing stop-limit philosophy. Add explicit guardrails such as:

- max_artifacts_per_session
- max_sessions_per_hour
- max_generations_per_hour by mode
- max_tokens_per_session / max_tokens_per_hour
- compute budget threshold
- low token threshold
- repeated critique pattern detection
- low novelty / low emergence streak detection
- forced reflect or rest after excessive loop behavior

When thresholds are hit: downgrade to Slow or pause runtime as appropriate.

---

## 8. Database / state model

- Prefer **derived** runtime variables for metabolism unless persistence is genuinely needed.
- Do not expand the canonical schema carelessly; respect the distinction between canonical fields (e.g. in `creative_state_snapshot`) and runtime helper signals.
- Audit whether scheduler config, mode config, token/compute thresholds, or fatigue/drive need to be stored (e.g. for resume after restart).

---

## 9. Implementation order (Phase 1)

1. Audit safest integration points (where scheduler calls existing `getLatestCreativeState`, `computeSessionMode`, `computeDriveWeights`, `selectDrive`, and `runSessionPipeline`).
2. Define runtime mode enum and config (Default/Slow/Steady/Turbo + thresholds).
3. Implement metabolism derivation (drive, fatigue, pressures) from existing state and history.
4. Implement scheduler loop with mode and metabolism.
5. Add limit guard (token/compute and stop limits) and low-token fallback.
6. Add Studio UI: always-on toggle, mode selector, status panel, metabolism panel, activity log.

Phase 2 (ecology) is described in `creative_ecology.md`.
