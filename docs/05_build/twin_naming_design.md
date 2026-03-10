# Twin Naming Feature — Design (A–D)

## A. Minimal schema changes

Table is `identity` (not twin_identity). Keep `name` nullable. Add columns only.

**Migration:** `supabase/migrations/YYYYMMDD_identity_naming_fields.sql`

```sql
ALTER TABLE identity
  ADD COLUMN IF NOT EXISTS name_status TEXT,
  ADD COLUMN IF NOT EXISTS name_rationale TEXT,
  ADD COLUMN IF NOT EXISTS naming_readiness_score NUMERIC,
  ADD COLUMN IF NOT EXISTS naming_readiness_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_naming_evaluated_at TIMESTAMPTZ;
```

- **name_status:** `unnamed` | `proposed` | `accepted` | `rejected`. When Harvey accepts a name we set `name_status = 'accepted'` and `name = <value>`; we never clear `name` to null after acceptance (rule: no repeated renaming).
- **name_rationale:** Free text for the Twin’s last proposal (why this name fits).
- **naming_readiness_score:** 0.0–1.0 from evaluator.
- **naming_readiness_notes:** Short human-readable notes from the evaluator (e.g. "Strong identity_seed; low recurrence").
- **last_naming_evaluated_at:** When we last ran the readiness evaluator (for caching / display).

No new tables for V1. Name proposals can stay in chat or be stored in these fields; approval remains PATCH identity or existing name-proposal flow.

---

## B. Route / service design

**1. Evaluate naming readiness (service + optional route)**

- **Lib:** `apps/studio/lib/naming-readiness.ts` — `evaluateNamingReadiness(supabase)` returns `{ score, notes, signals }` using current identity + source_item + memory. No DB write.
- **Route (optional):** `POST /api/identity/evaluate-naming-readiness` — calls the lib, optionally writes `naming_readiness_score`, `naming_readiness_notes`, `last_naming_evaluated_at` to the active identity, returns JSON. Chat can call this before replying when Harvey asks for the Twin’s name, or we can run the evaluator inside the chat flow and inject the result into the prompt.

**2. Propose name**

- **Route:** `POST /api/identity/propose-name` — requires active identity and `name == null` or `name_status != 'accepted'`. Builds a small prompt from identity + source summary + readiness score; calls OpenAI to get one primary name + rationale. Writes `name` (proposed), `name_status = 'proposed'`, `name_rationale`, and optionally refreshes readiness. Returns `{ proposedName, rationale }`. Chat can either call this API when Harvey asks “what’s your name?” and readiness is high, or the Twin can propose in-chat and we sync to identity after (minimal: do in-chat only and optionally call propose-name to persist proposal).

**Minimal approach:** Don’t add a separate propose-name route for the first version. Instead:
- In chat, when Harvey asks for the Twin’s name, the chat route (or a small helper) calls `evaluateNamingReadiness(supabase)` and injects the result into the working context so the Twin can answer in line (“I’m not ready” / “Provisionally X” / “The name that fits is X”) and optionally we later add a step that writes a proposed name to identity when the Twin proposes one in chat. For minimal, we only add:
  - `evaluateNamingReadiness()` in lib, and
  - `POST /api/identity/evaluate-naming-readiness` that runs it and **writes** score/notes/last_naming_evaluated_at to identity so the next chat turn has it in context.
- Name adoption stays as today: Harvey approves via Name proposals (apply_name) or PATCH identity; when applying, set `name_status = 'accepted'` and `name = <value>` and never clear name after that.

**3. Approval and anti-renaming**

- **Accept name:** Use existing flow: `POST /api/proposals/[id]/approve` with `action: "apply_name"` updates identity `name` from the proposal. Extend that update to also set `name_status = 'accepted'`.
- **PATCH /api/identity:** Allow updating `name` only when `name_status != 'accepted'` (or when explicitly “reopening” naming — not in minimal). When PATCH sets `name` and we want it to count as accepted, set `name_status = 'accepted'` so we don’t allow clearing name later.
- **Prevent repeated renaming:** In chat system prompt and in any propose-name logic: if `name_status === 'accepted'` and `name` is non-null, the Twin must not propose a new name unless Harvey explicitly asks to revisit identity.

---

## C. Chat prompt changes

**System prompt (extend):**

- If Harvey asks your name and your **accepted** name is null, first use the naming readiness information in the working context (score + notes). Base your answer on that:
  - **Low readiness (e.g. &lt; 0.4):** Say you are not ready yet and briefly why (e.g. identity still forming).
  - **Moderate (e.g. 0.4–0.64):** You may offer a provisional name and note it’s not final.
  - **High (e.g. 0.65+):** Propose one strong name with a short rationale.
- Do not fabricate a name if readiness is low. Do not default to generic assistant language.
- If your name is already **accepted** (name_status = accepted, name set), use that name and do not propose a new one unless Harvey explicitly asks to revisit identity.

**Working context (inject readiness when name is null):**

- When the active identity has `name` null (or name_status not `accepted`), include in the working context string:
  - `Naming readiness: score=<naming_readiness_score>, notes=<naming_readiness_notes>.`
- So the Twin sees the score and notes and can answer accordingly. The evaluator can be run on-demand when Harvey sends a message (e.g. if the last message asks about name, or every time) and the result written to identity so it’s in the next load of brain context; or run periodically. Minimal: run evaluator when building brain context for chat if `name` is null and we haven’t evaluated recently (e.g. in the last hour), then include score/notes in the context string.

---

## D. How the readiness score is computed from current data

All inputs are normalized to 0.0–1.0 where possible; then a weighted sum with a contradiction penalty.

**1. Structured identity coherence (weight 0.25)**  
- Use: `summary`, `philosophy`, `embodiment_direction`, `habitat_direction`.  
- Score: 0 if all null/empty; else based on combined length and non-emptiness (e.g. count of non-empty fields and total length cap). Simple: `(count of non-empty among 4) / 4` scaled by a small factor for “has content” (e.g. each field &gt; 50 chars adds a bit). Result in 0–1.

**2. Weighted identity source strength (weight 0.20)**  
- Use: `source_item` rows with `source_type` in (`identity_seed`, `reference`), and their `identity_weight`.  
- Score: Count of identity_seed items (e.g. cap at 5) + average of identity_weight (null → 0.5). Normalize to 0–1 (e.g. (min(count_seed, 5)/5)*0.6 + avg_weight*0.4).

**3. Annotation quality (weight 0.15)**  
- Use: On the same source items: presence of `tags`, `ontology_notes`, `identity_relevance_notes`.  
- Score: Share of items that have at least one of these set, or average “richness” (e.g. 1 if any has tags and (ontology or relevance), 0.5 if only one type). Normalize to 0–1.

**4. Recurrence consistency (weight 0.15)**  
- Use: We don’t have a direct “recurrence across sessions” signal in DB. Fallback: use creative_state snapshot’s `idea_recurrence` from the latest snapshot, or 0.5 if none. So score = idea_recurrence or 0.5.

**5. Memory confirmation (weight 0.10)**  
- Use: Recent memory summaries from `memory_record` (e.g. last 5). If we have at least one memory, score 0.5 + 0.5 * (min(count, 5)/5); else 0.3.

**6. Harvey explicit signal (weight 0.10)**  
- Use: Count of identity_seed sources + high identity_weight (e.g. &gt; 0.7). Normalize: e.g. (identity_seed_count/5)*0.6 + (share of items with weight &gt; 0.7)*0.4, capped to 1.

**7. Contradiction penalty (weight −0.15)**  
- Use: No structured contradiction detection in V1. Use 0 for now (no penalty). Later: simple heuristic over source_item content (e.g. very different tones or opposing claims) to reduce score.

**Formula:**

```text
score = 0.25*coherence + 0.20*source_strength + 0.15*annotation + 0.15*recurrence + 0.10*memory + 0.10*harvey_signal - 0.15*contradiction
```

Clamp `score` to 0–1. Write `naming_readiness_score` and a short `naming_readiness_notes` (e.g. "Strong identity_seed; low recurrence; no contradiction detected") to identity when we run the evaluator.

**Thresholds (for prompt only):**  
- 0.00–0.39 → not ready  
- 0.40–0.64 → provisional  
- 0.65+ → propose one strong name  
- 0.80+ → highly confident
