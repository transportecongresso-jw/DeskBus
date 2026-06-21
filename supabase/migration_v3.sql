-- =====================================================
-- Migration v3: Multi-day event support
-- =====================================================

-- Events table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Event days table
CREATE TABLE IF NOT EXISTS public.event_days (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  label TEXT NOT NULL,
  day_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, date)
);

-- Passenger participation per event day
CREATE TABLE IF NOT EXISTS public.passenger_event_days (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  passenger_id UUID NOT NULL REFERENCES public.passengers(id) ON DELETE CASCADE,
  event_day_id UUID NOT NULL REFERENCES public.event_days(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(passenger_id, event_day_id)
);

-- Link vehicles to event days
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS event_day_id UUID REFERENCES public.event_days(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_active ON public.events(is_active);
CREATE INDEX IF NOT EXISTS idx_event_days_event ON public.event_days(event_id);
CREATE INDEX IF NOT EXISTS idx_passenger_event_days_passenger ON public.passenger_event_days(passenger_id);
CREATE INDEX IF NOT EXISTS idx_passenger_event_days_day ON public.passenger_event_days(event_day_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_event_day ON public.vehicles(event_day_id);

-- RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passenger_event_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin general full access to events"
  ON public.events FOR ALL USING (is_admin_general());

CREATE POLICY "Authenticated can read events"
  ON public.events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin general full access to event_days"
  ON public.event_days FOR ALL USING (is_admin_general());

CREATE POLICY "Authenticated can read event_days"
  ON public.event_days FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin general full access to passenger_event_days"
  ON public.passenger_event_days FOR ALL USING (is_admin_general());

CREATE POLICY "Congregation admins manage passenger_event_days"
  ON public.passenger_event_days FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.passengers p
      JOIN public.congregation_admins ca ON ca.congregation_id = p.congregation_id
      WHERE p.id = passenger_id AND ca.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated can read passenger_event_days"
  ON public.passenger_event_days FOR SELECT TO authenticated USING (true);
