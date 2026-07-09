-- migration_v18: Vínculo Capitão-Passageiro
--
-- Um capitão é também um passageiro do veículo.
-- Este vínculo é opcional (pode ser criado depois da aprovação)
-- e editável a qualquer momento pelo administrador.

CREATE TABLE IF NOT EXISTS public.captain_passenger_links (
  captain_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  passenger_id    uuid        NOT NULL REFERENCES public.passengers(id) ON DELETE CASCADE,
  congregation_id uuid        NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  linked_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.captain_passenger_links ENABLE ROW LEVEL SECURITY;

-- admin_general: acesso total
CREATE POLICY "Admin general full access to captain_passenger_links"
  ON public.captain_passenger_links FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin_general')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin_general')
  );

-- admin_congregation: gerencia vínculos da própria congregação
CREATE POLICY "Congregation admin can manage captain passenger links in own congregation"
  ON public.captain_passenger_links FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.congregation_admins ca
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ca.user_id = auth.uid()
        AND ca.congregation_id = captain_passenger_links.congregation_id
        AND p.role = 'admin_congregation'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.congregation_admins ca
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ca.user_id = auth.uid()
        AND ca.congregation_id = captain_passenger_links.congregation_id
        AND p.role = 'admin_congregation'
    )
  );

-- captain: lê somente o próprio vínculo
CREATE POLICY "Captain can read own passenger link"
  ON public.captain_passenger_links FOR SELECT TO authenticated
  USING (captain_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_captain_passenger_links_passenger
  ON public.captain_passenger_links(passenger_id);
CREATE INDEX IF NOT EXISTS idx_captain_passenger_links_congregation
  ON public.captain_passenger_links(congregation_id);
