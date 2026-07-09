-- migration_v15: RLS para admins de congregação lerem/aprovarem capitães
--
-- Contexto: migration_v8 definiu SELECT/UPDATE somente para admin_general.
-- Admins de congregação precisam visualizar e aprovar solicitações de CAPITÃO
-- da sua própria congregação — e apenas da sua.
--
-- Regra de negócio:
--   • Solicitação de admin_congregation → exclusivamente SuperAdmin
--   • Solicitação de captain           → SuperAdmin + admin da congregação escolhida
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. access_requests ────────────────────────────────────────────────────────

-- SELECT: admin de congregação enxerga apenas solicitações de capitão da sua congregação
CREATE POLICY "Congregation admin can read captain requests for own congregation"
  ON public.access_requests FOR SELECT TO authenticated
  USING (
    requested_role = 'captain'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin_congregation'
    )
    AND EXISTS (
      SELECT 1 FROM public.congregation_admins ca
      WHERE ca.user_id = auth.uid()
        AND ca.congregation_id = access_requests.congregation_id
    )
  );

-- UPDATE: admin de congregação pode aprovar/rejeitar (alterar status) de capitão da sua congregação
CREATE POLICY "Congregation admin can update captain requests for own congregation"
  ON public.access_requests FOR UPDATE TO authenticated
  USING (
    requested_role = 'captain'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin_congregation'
    )
    AND EXISTS (
      SELECT 1 FROM public.congregation_admins ca
      WHERE ca.user_id = auth.uid()
        AND ca.congregation_id = access_requests.congregation_id
    )
  );


-- ── 2. congregation_admins ────────────────────────────────────────────────────
--
-- Quando um admin de congregação aprova um capitão, o código insere
-- { user_id: novoUserId, congregation_id: congId } em congregation_admins.
-- Sem policy de INSERT, essa operação é bloqueada pelo RLS.
--
-- Permite inserção somente na congregação à qual o admin pertence.

CREATE POLICY "Congregation admin can add members to own congregation"
  ON public.congregation_admins FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin_congregation'
    )
    AND EXISTS (
      SELECT 1 FROM public.congregation_admins ca
      WHERE ca.user_id = auth.uid()
        AND ca.congregation_id = congregation_admins.congregation_id
    )
  );
