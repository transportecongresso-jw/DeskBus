-- migration_v14: Allow unauthenticated users to read congregations
-- Needed for the public registration form (/request-access) where the user
-- must select their congregation before creating an account.
-- Congregations are non-sensitive public data (name + city only).

CREATE POLICY "Public read of congregations"
  ON public.congregations FOR SELECT
  TO anon, authenticated
  USING (true);
