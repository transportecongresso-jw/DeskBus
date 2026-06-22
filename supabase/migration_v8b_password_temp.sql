-- migration_v8b: add password_temp to access_requests
-- Run AFTER migration_v8_access_requests.sql
-- The password is stored temporarily until the SuperAdmin approves/rejects.
-- RLS ensures only admin_general can SELECT (read) this column.
-- It is cleared (set to NULL) immediately after account creation.

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS password_temp text;
