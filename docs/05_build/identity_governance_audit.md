# Identity-Governance Pass — Code Audit (A–D)

**Identity proposal → canon:** For status vs the full external “identity proposal canon” design (name vs traits/philosophy/motifs/concept definitions, identity_proposal/identity_canon tables), see `docs/03_governance/identity_proposal_canon_status.md`.

## A) Naming readiness — what already exists

| Piece | Location | What it does |
|-------|----------|--------------|
| **Schema** | `supabase/migrations/20250110000003_identity_naming_fields.sql` | Adds to `identity`: `name_status`, `name_rationale`, `naming_readiness_score`, `naming_readiness_notes`, `last_naming_evaluated_at`. `name` remains nullable. |
| **Evaluator** | `apps/studio/lib/naming-readiness.ts` | `evaluateNamingReadiness(supabase)` returns `{ score, notes }`. Uses: structured coherence (4 identity fields), source strength (identity_seed count + avg identity_weight), annotation quality (tags/ontology/relevance), recurrence (creative state `idea_recurrence`), memory count, harvey signal (identity_seed + high weight). Contradiction is stubbed to 0. Weights: coherence 0.25, sourceStrength 0.2, annotation 0.15, recurrence 0.15, memory 0.1, harveySignal 0.1, contradiction −0.15. |
| **API** | `apps/studio/app/api/identity/evaluate-naming-readiness/route.ts` | POST runs evaluator and writes `naming_readiness_score`, `naming_readiness_notes`, `last_naming_evaluated_at` on active identity. |
| **Brain context** | `apps/studio/lib/brain-context.ts` | Loads identity including naming fields. `buildWorkingContextString()` includes "Naming readiness: score=… notes=…" when name is not accepted. |
| **Chat prompt** | `apps/studio/app/api/chat/route.ts` (SYSTEM_PROMPT) | Naming rules: low (<0.4) not ready, moderate (0.4–0.64) provisional, high (0.65+) strong proposal; do not propose when name already accepted. |
| **Approval / anti-renaming** | `apps/studio/app/api/proposals/[id]/approve/route.ts` | `apply_name` sets identity `name` and `name_status = 'accepted'`. `apps/studio/app/api/identity/route.ts` PATCH rejects clearing/changing name when `name_status === 'accepted'`. |

**Missing / partial:** Contradiction is always 0 (no cross-source contradiction detection). Naming readiness does not yet use the doc’s full identity_stability_score (seed_strength, source_convergence, session_evidence, artifact_pattern_strength, etc.); it uses a simpler mix.

---

## B) Identity signal weighting — what already exists

| Piece | Location | What it does |
|-------|----------|--------------|
| **creative_state_snapshot** | `supabase/migrations/20250108000001_twin_core_tables.sql` | Table has `identity_stability` (REAL). Updated in evaluation flow after artifacts (e.g. alignment_score). |
| **Evaluation package** | `packages/evaluation/src/creative-state.ts` | `identity_stability` in state; used in drive weights (e.g. coherence weight increases when identity_stability low). No explicit seed_strength, source_convergence, session_evidence, artifact_pattern_strength, memory_confirmation, evaluation_consistency formula in Studio. |
| **Source ordering** | `apps/studio/lib/source-context.ts` | Sources ordered by `identity_weight` desc, then `ingested_at` desc. No “seed strength” or “convergence” score. |

**Missing:** No single identity_stability_score formula in Studio that combines seed_strength, source_convergence, session_evidence, artifact_pattern_strength, memory_confirmation, evaluation_consistency, contradiction_penalty. No explicit “seeds weaken as session/memory evidence grows” blend.

---

## C) Where chat context is truncated too aggressively

| Location | Current behavior | Problem |
|----------|------------------|--------|
| `apps/studio/app/api/chat/route.ts` lines 153–159 | `workingContextString = buildWorkingContextString(brainContext)` then `userInput = '[Working context]\n' + workingContextString.slice(0, 4000) + '\n\n[Harvey's message]\n' + content` | The **entire** working context (identity + creative state + memory + source) is truncated to **4000 characters**. Identity and creative state and memory come first in the string, so when they are long, **source context is cut off or removed**. No guaranteed minimum for source. |

Session/generation path (`apps/studio/app/api/session/run/route.ts`) passes the **full** `workingContextString` (no 4000 cap) to `runSessionPipeline`; only chat is affected.

---

## D) Files responsible for working-context assembly and chat prompt construction

| File | Responsibility |
|------|----------------|
| `apps/studio/lib/source-context.ts` | `getSourceContextForSession(supabase)` — selects identity_seed/reference sources, orders by identity_weight then ingested_at, builds one string per item (title, type, role, weight, content, tags, ontology, relevance, general_notes), joins with `\n\n---\n\n`. Returns string or null. Capped at 15 items, 2000 chars per item; **no** per-item ranking/compression by “importance”. |
| `apps/studio/lib/brain-context.ts` | `getBrainContext(supabase)` — loads identity, creative state, memory (via retrieveMemory), source (getSourceContextForSession). Returns structured `BrainContextResult`. `buildWorkingContextString(ctx)` — builds one string: identity block (name if accepted, summary, philosophy, embodiment, habitat, naming readiness if not accepted), creative state line, memory block, "Source context:\n" + sourceSummary.slice(0, 3000). **Order:** identity → creative state → memory → source. |
| `apps/studio/app/api/chat/route.ts` | Gets `brainContext`, calls `buildWorkingContextString(brainContext)`, then **slices the whole string to 4000 chars** and prepends to user message. Builds system + user messages for OpenAI. |
| `apps/studio/app/api/session/run/route.ts` | Gets brain context, builds full working context string, passes to `runSessionPipeline` as `sourceContext` (no truncation). |

---

## Minimal implementation plan

1. **Identity signal weighting**  
   - Add `apps/studio/lib/identity-signal.ts`: compute `identityStabilityScore` from seed_strength (identity_seed count + avg identity_weight + annotation factor), source_convergence (heuristic: variance of weights or 0.5 stub), session_evidence (session count normalized), artifact_pattern_strength (artifact count normalized), memory_confirmation (memory count normalized), evaluation_consistency (creative state identity_stability/idea_recurrence), contradiction_penalty (0 stub). Return 0–1 and optional breakdown. Optionally use this score in naming readiness (e.g. as extra factor or replace part of current formula).
2. **Chat context budgeting**  
   - Add structured budget in `brain-context.ts` (or `chat-context-budget.ts`): e.g. identity 800, creative state 200, memory 600, **source 2400** (total 4000). Build chat string in four segments, each capped independently, so **source always gets up to 2400 chars**. Session path continues to use full `buildWorkingContextString` unchanged.
3. **Chat route**  
   - Use the new budgeted builder for chat only; pass `brainContext` and budget; get back string that guarantees source segment.
4. **Naming readiness**  
   - Keep existing evaluator; optionally incorporate identity_stability_score into notes or into a single “readiness” display. No change to name approval flow.
5. **Developer note**  
   - Add short doc describing naming readiness, identity signal weighting, and chat vs session context budgeting.

---

## Risks / mismatches

- **Schema:** Table is `identity`, not `twin_identity`; naming fields already added. No mismatch.
- **Contradiction:** Still stubbed; no semantic contradiction detection in V1.
- **Session/generation:** Unchanged; only chat gets budgeted context to avoid regressions.

---

## Implementation summary (after pass)

### 1. Identity signal weighting
- **File:** `apps/studio/lib/identity-signal.ts`
- **Function:** `computeIdentityStabilityScore(supabase)` returns `{ score, breakdown }`.
- **Formula:** `score = 0.30*seed_strength + 0.20*source_convergence + 0.15*session_evidence + 0.15*artifact_pattern_strength + 0.10*memory_confirmation + 0.10*evaluation_consistency - 0.15*contradiction_penalty`.
- **Signals:** seed_strength from identity_seed count, avg identity_weight, annotation factor; source_convergence from weight variance (low variance → higher); session_evidence from session count (cap 10); artifact_pattern_strength from artifact count (cap 8); memory_confirmation from memory count; evaluation_consistency from creative state (identity_stability + idea_recurrence)/2; contradiction_penalty = 0.
- **Use:** Available for API or future use; chat can optionally pass it into `buildChatContextWithBudget` so the Twin sees "Identity stability score".

### 2. Chat context budgeting
- **File:** `apps/studio/lib/brain-context.ts`
- **Constants:** `CHAT_CONTEXT_BUDGET = { identity: 800, creativeState: 200, memory: 600, source: 2400 }`.
- **Function:** `buildChatContextWithBudget(ctx, identityStability?)` builds the working context in four segments, each sliced to its budget. Source always receives up to 2400 characters.
- **Chat route:** `apps/studio/app/api/chat/route.ts` uses `buildChatContextWithBudget(brainContext)` instead of `buildWorkingContextString(brainContext).slice(0, 4000)`. No single global truncation; source is guaranteed its segment.
- **Session/generation:** Still use `buildWorkingContextString` (full context, no per-segment cap).

### 3. Naming readiness (unchanged)
- **Computation:** `apps/studio/lib/naming-readiness.ts` — `evaluateNamingReadiness(supabase)`.
- **Storage:** `identity.naming_readiness_score`, `identity.naming_readiness_notes`, `identity.last_naming_evaluated_at` (written by POST `/api/identity/evaluate-naming-readiness`).
- **Context:** Included in identity segment when name is not accepted; low/medium/high behavior in chat system prompt.
- **Approval:** Name adoption only via name proposal apply_name or explicit PATCH; once accepted, name cannot be cleared.

---

## Developer note: identity governance

**Naming readiness**  
The Twin decides whether it is ready to self-name using a 0–1 score computed from: structured identity coherence (summary, philosophy, embodiment, habitat), identity_seed/reference strength and weights, annotation quality (tags, ontology_notes, identity_relevance_notes), recurrence (idea_recurrence from creative state), memory count, and Harvey signal (high identity_weight sources). Contradiction is stubbed to 0. The score is stored on the active identity and exposed in working context as "Naming readiness: score=… notes=…". Chat system prompt instructs: low (<0.4) → not ready; moderate (0.4–0.64) → provisional name OK; high (0.65+) → strong proposal. Final name always requires approval; once accepted, the Twin must not propose a new name unless Harvey asks to revisit.

**Identity signal weighting**  
`identity-signal.ts` computes an identity_stability_score from: seed_strength, source_convergence (heuristic from weight variance), session_evidence (session count), artifact_pattern_strength (artifact count), memory_confirmation, evaluation_consistency (from creative state). Seeds contribute 30%; experience signals (sessions, artifacts, memory, evaluation) contribute the rest, so identity can stabilize from either strong seeds or accumulated experience. This score is available for APIs or for inclusion in chat context; naming readiness uses its own formula but can be aligned with this model in a later pass.

**Chat context budgeting**  
Chat no longer truncates the entire working context with a single slice. Instead, the context is built in four segments with fixed character budgets: identity (800), creative state (200), memory (600), source (2400). Source context is guaranteed up to 2400 characters so it is not crowded out by identity or memory. Session and generation paths still use the full working context string with no per-segment cap.
