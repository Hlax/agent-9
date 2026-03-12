# Runtime observability reset — reference

Use this to clear **runtime-generated** data (sessions, traces, proposals, continuity/debug) for a clean retest without changing foundational schema or curated seed/config.

---

## 1. Tables safe to clear (runtime-generated)

These hold session history, traces, proposals, and continuity/debug outputs. Safe to delete/truncate for a fresh runtime test.

| Table | Purpose |
|-------|--------|
| `trajectory_review` | Trajectory review records (FK: session, deliberation_trace). |
| `deliberation_trace` | Structured reasoning per session (FK: session, CASCADE from session). |
| `creative_state_snapshot` | Continuity snapshots per session (CASCADE from session). |
| `generation_run` | Per-session generation runs (CASCADE from session). |
| `memory_record` | Runtime memories (source_session_id, source_artifact_id). |
| `critique_record` | Per-artifact/session critique (artifact_id, session_id). |
| `evaluation_signal` | Signals targeting artifacts/sessions/ideas/threads (generic target_type/target_id). |
| `approval_record` | Artifact approval history. |
| `publication_record` | Artifact publication history. |
| `proposal_record` | Surface/avatar proposals (artifact_id ON DELETE SET NULL). |
| `artifact_to_idea` | Artifact–idea links (CASCADE from artifact). |
| `artifact_to_thread` | Artifact–thread links (CASCADE from artifact). |
| `archive_entry` | Archive entries (artifact, session, idea, thread). |
| `artifact` | Session-generated artifacts (session_id; identity.active_avatar_artifact_id SET NULL on delete). |
| `change_record` | Governance/audit records (optional to clear; no FK from others). |
| `creative_session` | Session hub (trace, decision_summary live here). |

**`idea`:** Do **not** delete rows. Only **null out** `origin_session_id` for ideas that reference sessions you are about to delete, so sessions can be removed without violating the FK from `idea.origin_session_id` → `creative_session(session_id)`.

---

## 2. Tables to leave alone (schema / config / canon / reference)

Do **not** truncate or delete from these.

| Table | Reason |
|-------|--------|
| `identity` | Canon/config; `active_avatar_artifact_id` is SET NULL when artifacts are deleted. |
| `project` | Curated projects. |
| `idea_thread` | Curated threads. |
| `idea` | Curated + session-originated ideas; only update `origin_session_id` → NULL where needed. |
| `idea_to_thread` | Curated idea–thread links. |
| `theme` | Reference. |
| `tag` | Reference. |
| `source_item` | Ingested/canon content. |
| `runtime_config` | Runtime config (e.g. mode, always_on, last_run_at). |

**Chat (optional):** `chat_thread`, `chat_message` are operator UI; leave as-is unless you explicitly want a chat reset.

---

## 3. SQL in dependency-safe order

Deletes must run in **child-first** order so no FK is violated. Use the script in `supabase/backups/runtime_reset_observability.sql` (or the block below).

Order:

1. **trajectory_review** (depends on session, deliberation_trace)  
2. **deliberation_trace** (depends on session)  
3. **creative_state_snapshot** (depends on session)  
4. **generation_run** (depends on session)  
5. **memory_record** (depends on session, artifact)  
6. **critique_record** (depends on artifact, session)  
7. **evaluation_signal** (logical target: artifact/session/idea/thread)  
8. **approval_record** (depends on artifact)  
9. **publication_record** (depends on artifact)  
10. **proposal_record** (references artifact; clearing removes all proposals)  
11. **artifact_to_idea** (depends on artifact)  
12. **artifact_to_thread** (depends on artifact)  
13. **archive_entry** (depends on artifact, session, idea, thread)  
14. **artifact** (depends on session; identity.active_avatar_artifact_id SET NULL)  
15. **change_record** (optional; no FK from other tables)  
16. **idea**: `UPDATE idea SET origin_session_id = NULL WHERE origin_session_id IS NOT NULL;`  
17. **creative_session**

---

## 4. Sequences / identity values

- **No sequences to reset.** All listed tables use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- **`runtime_config`** uses a `TEXT` primary key (key names), not a sequence.
- If you add any table with `SERIAL`/`BIGSERIAL` later, document it and reset only if you need stable IDs for tests (e.g. `SELECT setval('table_id_seq', 1);`).

---

## 5. Caveats

- **Foreign keys:** The script uses explicit `DELETE FROM …` in the order above. Do **not** reorder; deleting sessions before artifacts/children would violate FKs (e.g. `idea.origin_session_id`, `artifact.session_id`).
- **CASCADE:** Deleting from `creative_session` would CASCADE only to `creative_state_snapshot`, `deliberation_trace`, `trajectory_review`, and `generation_run`. All other tables (artifact, critique_record, memory_record, archive_entry, idea.origin_session_id) are not CASCADE, so they must be cleared or updated **before** deleting sessions.
- **identity.active_avatar_artifact_id:** References `artifact(artifact_id) ON DELETE SET NULL`. Clearing artifacts will set this to NULL; no extra step needed.
- **proposal_record.artifact_id:** `ON DELETE SET NULL`. Deleting artifacts nulls this; we clear the whole table so proposals are gone for a clean retest.
- **Views / materialized views:** None found in migrations; no view refresh needed.
- **RLS:** If RLS is enabled (e.g. on `runtime_config`), run the script as a role that bypasses RLS (e.g. service role or in a migration), or ensure your role can delete from all listed tables.
- **Backup:** Run a schema/data backup before the first use (e.g. `pg_dump` or Supabase backup). This script does not modify schema or seed/config tables.

---

**Script location:** `supabase/backups/runtime_reset_observability.sql`
