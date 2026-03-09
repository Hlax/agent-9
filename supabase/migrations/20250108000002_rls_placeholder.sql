-- RLS placeholder: enable when Supabase Auth is wired.
-- Studio should be private; public-site reads only published artifacts.
-- For V1 scaffold, policies can be added in a follow-up migration.

ALTER TABLE identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE project ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_record ENABLE ROW LEVEL SECURITY;

-- Placeholder: allow all for local dev until auth is configured
CREATE POLICY "allow_all_identity" ON identity FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_project" ON project FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_session" ON creative_session FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_artifact" ON artifact FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_approval" ON approval_record FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_publication" ON publication_record FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_proposal" ON proposal_record FOR ALL USING (true) WITH CHECK (true);
