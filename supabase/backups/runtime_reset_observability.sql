-- Runtime observability reset: remove session history, traces, proposals, continuity/debug.
-- Safe to run for a clean retest; does NOT touch schema, seed, or config (see docs/runtime_reset_reference.md).
-- Run in dependency order (child-first). No sequence reset needed (UUID PKs).

BEGIN;

-- 1. Trajectory review (depends on session, deliberation_trace)
DELETE FROM trajectory_review;

-- 2. Deliberation trace (depends on session)
DELETE FROM deliberation_trace;

-- 3. Creative state snapshot (depends on session)
DELETE FROM creative_state_snapshot;

-- 4. Generation run (depends on session)
DELETE FROM generation_run;

-- 5. Memory record (source_session_id, source_artifact_id)
DELETE FROM memory_record;

-- 6. Critique record (artifact, session)
DELETE FROM critique_record;

-- 7. Evaluation signal (target_type/target_id reference artifacts, sessions, ideas, threads)
DELETE FROM evaluation_signal;

-- 8. Approval record (artifact)
DELETE FROM approval_record;

-- 9. Publication record (artifact)
DELETE FROM publication_record;

-- 10. Proposal record (runtime proposals; artifact_id will be nulled if we had deleted artifacts first)
DELETE FROM proposal_record;

-- 11. Artifact–idea links (artifact)
DELETE FROM artifact_to_idea;

-- 12. Artifact–thread links (artifact)
DELETE FROM artifact_to_thread;

-- 13. Archive entry (artifact, session, idea, thread)
DELETE FROM archive_entry;

-- 14. Artifact (session output; identity.active_avatar_artifact_id SET NULL on delete)
DELETE FROM artifact;

-- 15. Change record (optional governance/audit; no FK from others)
DELETE FROM change_record;

-- 16. Null session reference on ideas so we can delete sessions
UPDATE idea SET origin_session_id = NULL WHERE origin_session_id IS NOT NULL;

-- 17. Creative session (trace, decision_summary live here)
DELETE FROM creative_session;

COMMIT;
