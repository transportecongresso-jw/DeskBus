-- migration_v20: Correção RLS capitães — evita recursão infinita
--
-- O problema da v19: a policy de congregation_admins referenciava
-- congregation_admins em seu USING, criando recursão infinita no RLS.
--
-- Solução: funções SECURITY DEFINER que executam como superusuário,
-- contornando o RLS (mesma abordagem do get_my_profile).

-- ── 1. Remove as políticas problemáticas da v19 ──────────────────────────────
DROP POLICY IF EXISTS "Congregation admin can read members of own congregation"        ON public.congregation_admins;
DROP POLICY IF EXISTS "Congregation admin can read profiles of own congregation members" ON public.profiles;

-- ── 2. Função auxiliar: retorna congregation_ids do usuário atual ─────────────
--    SECURITY DEFINER = roda como owner, sem RLS → sem recursão.
CREATE OR REPLACE FUNCTION public.get_my_congregation_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT congregation_id
  FROM public.congregation_admins
  WHERE user_id = auth.uid();
$$;

-- ── 3. Policy não-recursiva para congregation_admins ─────────────────────────
--    Usa a função acima para verificar a congregação do usuário atual
--    sem consultar a própria tabela diretamente no USING.
CREATE POLICY "Congregation admin can read members of own congregation"
  ON public.congregation_admins FOR SELECT TO authenticated
  USING (
    congregation_id IN (SELECT public.get_my_congregation_ids())
  );

-- ── 4. Função que retorna capitães visíveis para o usuário atual ──────────────
--    Encapsula toda a lógica de acesso; evita queries diretas com RLS complexo.
CREATE OR REPLACE FUNCTION public.get_captains_for_my_congregations()
RETURNS TABLE (
  id              uuid,
  full_name       text,
  email           text,
  phone           text,
  congregation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role     text;
  caller_cong_ids uuid[];
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role = 'admin_general' THEN
    RETURN QUERY
      SELECT DISTINCT ON (p.id)
        p.id, p.full_name, p.email, p.phone, ca.congregation_id
      FROM public.profiles p
      JOIN public.congregation_admins ca ON ca.user_id = p.id
      WHERE p.role = 'captain'
      ORDER BY p.id;

  ELSIF caller_role = 'admin_congregation' THEN
    SELECT array_agg(congregation_id) INTO caller_cong_ids
    FROM public.congregation_admins
    WHERE user_id = auth.uid();

    RETURN QUERY
      SELECT DISTINCT ON (p.id)
        p.id, p.full_name, p.email, p.phone, ca.congregation_id
      FROM public.profiles p
      JOIN public.congregation_admins ca ON ca.user_id = p.id
      WHERE p.role = 'captain'
        AND ca.congregation_id = ANY(caller_cong_ids)
      ORDER BY p.id;
  END IF;
END;
$$;
