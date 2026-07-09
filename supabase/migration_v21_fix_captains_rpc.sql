-- migration_v21: Reescreve RPC de capitães para receber congregation_ids como parâmetro
--
-- Problema da v20: get_captains_for_my_congregations() usava auth.uid() internamente
-- para descobrir as congregações do usuário, mas SET search_path = public excluía
-- o schema auth, fazendo auth.uid() retornar NULL para admins de congregação.
--
-- Solução: receber os congregation_ids direto do frontend (que já os conhece via
-- AuthContext) e apenas executar a query como SECURITY DEFINER para bypassar RLS.

DROP FUNCTION IF EXISTS public.get_captains_for_my_congregations();

CREATE OR REPLACE FUNCTION public.get_captains_for_congregations(p_congregation_ids uuid[])
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
BEGIN
  IF p_congregation_ids IS NULL OR array_length(p_congregation_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id,
      p.full_name,
      p.email,
      p.phone,
      ca.congregation_id
    FROM public.profiles p
    JOIN public.congregation_admins ca ON ca.user_id = p.id
    WHERE p.role = 'captain'
      AND ca.congregation_id = ANY(p_congregation_ids)
    ORDER BY p.id;
END;
$$;
