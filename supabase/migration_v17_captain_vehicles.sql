-- migration_v17: Vinculação Capitão-Veículo
--
-- Permite que administradores atribuam veículos específicos a capitães.
-- Capitães só enxergam os veículos que lhes foram atribuídos.

CREATE TABLE IF NOT EXISTS public.captain_vehicles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  captain_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id      uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  congregation_id uuid        NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  assigned_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (captain_id, vehicle_id)
);

ALTER TABLE public.captain_vehicles ENABLE ROW LEVEL SECURITY;

-- admin_general: acesso total
CREATE POLICY "Admin general full access to captain_vehicles"
  ON public.captain_vehicles FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin_general')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin_general')
  );

-- admin_congregation: gerencia vínculos da própria congregação
CREATE POLICY "Congregation admin can manage captain vehicles in own congregation"
  ON public.captain_vehicles FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.congregation_admins ca
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ca.user_id = auth.uid()
        AND ca.congregation_id = captain_vehicles.congregation_id
        AND p.role = 'admin_congregation'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.congregation_admins ca
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ca.user_id = auth.uid()
        AND ca.congregation_id = captain_vehicles.congregation_id
        AND p.role = 'admin_congregation'
    )
  );

-- captain: lê somente os próprios vínculos
CREATE POLICY "Captain can read own vehicle assignments"
  ON public.captain_vehicles FOR SELECT TO authenticated
  USING (captain_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_captain_vehicles_captain      ON public.captain_vehicles(captain_id);
CREATE INDEX IF NOT EXISTS idx_captain_vehicles_vehicle      ON public.captain_vehicles(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_captain_vehicles_congregation ON public.captain_vehicles(congregation_id);
