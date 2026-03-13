# Continuity / Recurrence Audit

**Goal:** Verify that recurrence and continuity signals actually affect project/thread selection (not just stored).

## Data flow (verified)

1. **Write path (artifact sessions)**  
   `session-runner.ts` → `persistDerivedState`:
   - Updates `idea.recurrence_score` and `idea_thread.recurrence_score` from `evaluation.recurrence_score` and `evaluation.pull_score` (as `creative_pull`) for the **selected** idea/thread.
   - So sessions that produce an artifact reinforce the chosen thread/idea for the next run.

2. **Read path (every session when not in return mode)**  
   `session-runner.ts` → `selectFocus` → `selectProjectAndThread` (in `project-thread-selection.ts`):
   - Loads `idea_thread.recurrence_score` and `idea_thread.creative_pull` per thread.
   - Weights threads by `recurrence_score * 0.6 + creative_pull * 0.4` (plus intent boost when applicable).
   - Same for ideas: `idea.recurrence_score` and `idea.creative_pull` weight idea choice within the chosen thread.
   - So higher recurrence/pull → higher chance of being selected next session.

3. **Return mode**  
   Archive selection uses its own scoring (return intelligence + taste bias); recurrence on `idea_thread`/`idea` still affects which project/thread exist and are “active,” but the immediate choice is archive-driven.

**Conclusion:** Continuity is not only observed; it affects what the agent comes back to. Same-thread sessions increase that thread’s recurrence_score → next session weights it higher. Fragmented history leaves recurrence more evenly spread → more exploratory weighting.

## Acceptance scenarios

- **Scenario A (same-thread reinforcement)**  
  Run several sessions on the same project/thread (artifact-producing).  
  **Expect:** That thread’s `recurrence_score` (and optionally `creative_pull`) is updated in DB after each run; next session should have higher likelihood of selecting the same thread (weighted choice, not deterministic).

- **Scenario B (fragmented history)**  
  Run sessions that switch threads or produce no artifact (so no recurrence write-back).  
  **Expect:** Thread weights stay more even; selection is more exploratory and less “sticky” to one thread.

## How to inspect

- **DB:** Check `idea_thread.recurrence_score` and `creative_pull` (and `idea.recurrence_score`, `creative_pull`) before/after artifact sessions.
- **Runtime:** Session log `[session] selection: project_thread_idea` indicates project/thread selection ran; recurrence and creative_pull are used in `selectProjectAndThread` for weighting.
- **Code:** `apps/studio/lib/project-thread-selection.ts` (thread/idea weights), `apps/studio/lib/session-runner.ts` (persistDerivedState recurrence write-back).
