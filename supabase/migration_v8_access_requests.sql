-- migration_v8: Access Requests (Solicitações de Acesso)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  congregation_name text NOT NULL,
  phone text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate pending/approved requests for same email
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_email_active
  ON public.access_requests (email)
  WHERE status IN ('pending', 'approved');

-- RLS
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Public: anyone can submit a request (anon key)
CREATE POLICY "Anyone can submit access request"
  ON public.access_requests FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

-- SuperAdmin only: read and update
CREATE POLICY "Admin can read access requests"
  ON public.access_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin_general'
    )
  );

CREATE POLICY "Admin can update access requests"
  ON public.access_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin_general'
    )
  );
