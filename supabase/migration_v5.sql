-- =====================================================
-- Migration v5: Empresas de Transporte + Avaliações + Notas Fiscais
-- Execute no SQL Editor do Supabase
-- =====================================================

-- 1. Empresas de Transporte
CREATE TABLE IF NOT EXISTS public.transport_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT,
  contact_name TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vincular empresa ao veículo
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS transport_company_id UUID REFERENCES public.transport_companies(id);

-- 3. Avaliações de veículos
CREATE TABLE IF NOT EXISTS public.vehicle_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  congregation_id UUID NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id),
  rated_by UUID REFERENCES public.profiles(id),
  overall_stars INTEGER NOT NULL CHECK (overall_stars BETWEEN 1 AND 5),
  driver_rating INTEGER CHECK (driver_rating BETWEEN 1 AND 5),
  cleanliness_rating INTEGER CHECK (cleanliness_rating BETWEEN 1 AND 5),
  comfort_rating INTEGER CHECK (comfort_rating BETWEEN 1 AND 5),
  condition_rating INTEGER CHECK (condition_rating BETWEEN 1 AND 5),
  ac_rating INTEGER CHECK (ac_rating BETWEEN 0 AND 5),
  seatbelts TEXT CHECK (seatbelts IN ('all_ok', 'some_broken', 'many_broken')),
  observations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vehicle_id, congregation_id, event_id)
);

-- 4. Notas Fiscais
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  congregation_id UUID NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id),
  event_id UUID REFERENCES public.events(id),
  transport_company_id UUID REFERENCES public.transport_companies(id),
  invoice_date DATE NOT NULL,
  invoice_number TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  file_url TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'reviewed')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_transport_companies_name ON public.transport_companies(name);
CREATE INDEX IF NOT EXISTS idx_vehicles_transport_company ON public.vehicles(transport_company_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_ratings_vehicle ON public.vehicle_ratings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_ratings_congregation ON public.vehicle_ratings(congregation_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_ratings_event ON public.vehicle_ratings(event_id);
CREATE INDEX IF NOT EXISTS idx_invoices_congregation ON public.invoices(congregation_id);
CREATE INDEX IF NOT EXISTS idx_invoices_event ON public.invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- 6. RLS
ALTER TABLE public.transport_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- transport_companies: SuperAdmin gerencia, todos autenticados leem
CREATE POLICY "Admin general full access to transport_companies"
  ON public.transport_companies FOR ALL USING (is_admin_general());

CREATE POLICY "Authenticated can read transport_companies"
  ON public.transport_companies FOR SELECT TO authenticated USING (true);

-- vehicle_ratings: congregation admin avalia seus veículos, SuperAdmin vê tudo
CREATE POLICY "Admin general full access to vehicle_ratings"
  ON public.vehicle_ratings FOR ALL USING (is_admin_general());

CREATE POLICY "Congregation admin can manage own ratings"
  ON public.vehicle_ratings FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = congregation_id AND ca.user_id = auth.uid()
  ));

-- invoices: congregation admin gerencia suas notas, SuperAdmin vê/edita tudo
CREATE POLICY "Admin general full access to invoices"
  ON public.invoices FOR ALL USING (is_admin_general());

CREATE POLICY "Congregation admin can manage own invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = congregation_id AND ca.user_id = auth.uid()
  ));

-- 7. Storage bucket para notas fiscais
-- Execute separadamente no painel Supabase → Storage → New bucket:
-- Nome: invoices
-- Public: SIM (para visualização direta)
-- Ou via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true)
-- ON CONFLICT DO NOTHING;
