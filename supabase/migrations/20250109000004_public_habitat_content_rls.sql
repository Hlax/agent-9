ALTER TABLE public_habitat_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_public_habitat_content" ON public_habitat_content FOR ALL USING (true) WITH CHECK (true);
