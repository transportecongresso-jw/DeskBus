-- migration_v19: Permite que admins de congregação leiam membros da sua congregação
--
-- Problema: CaptainsPage busca congregation_admins para descobrir quais usuários
-- pertencem à congregação. O RLS bloqueava essa leitura para admins de congregação
-- (eles só enxergavam o próprio registro).
--
-- Também precisa ler profiles dos capitães da congregação.

-- ── 1. congregation_admins: SELECT para admins da mesma congregação ──────────

CREATE POLICY "Congregation admin can read members of own congregation"
  ON public.congregation_admins FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.congregation_admins ca
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ca.user_id = auth.uid()
        AND ca.congregation_id = congregation_admins.congregation_id
        AND p.role IN ('admin_congregation', 'admin_general')
    )
  );

-- ── 2. profiles: SELECT para admins lerem perfis da própria congregação ───────
--
-- Permite que admins de congregação leiam o perfil de qualquer usuário
-- que esteja vinculado à mesma congregação.

CREATE POLICY "Congregation admin can read profiles of own congregation members"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    -- Próprio perfil sempre visível
    id = auth.uid()
    OR
    -- Perfis de membros da mesma congregação
    EXISTS (
      SELECT 1 FROM public.congregation_admins ca_admin
      JOIN public.congregation_admins ca_member
        ON ca_member.congregation_id = ca_admin.congregation_id
      JOIN public.profiles p_admin ON p_admin.id = auth.uid()
      WHERE ca_admin.user_id = auth.uid()
        AND ca_member.user_id = profiles.id
        AND p_admin.role IN ('admin_congregation', 'admin_general')
    )
  );
