-- =====================================================
-- Migration v4: Multi-event architecture
-- =====================================================

-- Update events: replace is_active with status + notes
ALTER TABLE public.events DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'closed', 'cancelled'));
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS notes TEXT;

-- Event-congregation junction table
CREATE TABLE IF NOT EXISTS public.event_congregations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  congregation_id UUID NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, congregation_id)
);

-- Add event_id to vehicles (which event this vehicle belongs to)
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id);

-- Add event_id to passengers
ALTER TABLE public.passengers ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_congregations_event ON public.event_congregations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_congregations_cong ON public.event_congregations(congregation_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_event ON public.vehicles(event_id);
CREATE INDEX IF NOT EXISTS idx_passengers_event ON public.passengers(event_id);

-- RLS for event_congregations
ALTER TABLE public.event_congregations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin general full access to event_congregations"
  ON public.event_congregations FOR ALL USING (is_admin_general());

CREATE POLICY "Authenticated can read event_congregations"
  ON public.event_congregations FOR SELECT TO authenticated USING (true);
