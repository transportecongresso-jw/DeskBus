-- migration_v23: Permite admins de congregação lerem perfis de capitães
--
-- Problema: admin_congregation não tinha policy para ler profiles de outros
-- usuários (apenas o próprio perfil). A RPC get_captains_for_congregations
-- bypassa isso via SECURITY DEFINER, mas pode ter issues de serialização de
-- UUID arrays no PostgREST. Esta policy permite queries diretas sem RPC.
--
-- Usa get_my_profile() e get_my_congregation_ids() (já SECURITY DEFINER)
-- para evitar recursão na policy da tabela profiles.

CREATE POLICY "Admins can read captain profiles in their congregations"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    -- Próprio perfil
    id = auth.uid()
    OR
    -- Admin geral vê todos
    (SELECT role FROM public.get_my_profile() LIMIT 1) = 'admin_general'
    OR
    -- Admin de congregação vê capitães da sua congregação
    (
      role = 'captain'
      AND id IN (
        SELECT ca.user_id
        FROM public.congregation_admins ca
        WHERE ca.congregation_id IN (SELECT public.get_my_congregation_ids())
      )
    )
  );
