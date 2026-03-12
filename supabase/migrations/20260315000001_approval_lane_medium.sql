-- Proposal resolution lanes: surface (staging/public), medium (roadmap/spec), system (governance).
-- Canon: docs/architecture/proposal_lanes_implementation_plan.md
-- Only surface proposals can be approved for staging or publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'approval_lane' AND e.enumlabel = 'medium'
  ) THEN
    ALTER TYPE approval_lane ADD VALUE 'medium';
  END IF;
END
$$;

COMMENT ON TYPE approval_lane IS 'Proposal decision lane: surface (stageable/publishable), medium (roadmap/spec), system (governance). artifact retained for artifact-level approval.';
