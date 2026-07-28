-- Legacy migration retained for audit; not part of linked CLI history.
-- Allow anonymous (public) read access to district_statistics
-- The API routes use the anon key and need to read this table.

ALTER TABLE district_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_anon_read" ON district_statistics;

CREATE POLICY "allow_anon_read"
  ON district_statistics
  FOR SELECT
  TO anon, authenticated
  USING (true);
