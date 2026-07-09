-- migration_v22: Corrige acesso do admin_general em congregation_admins
--
-- Problema: migration_v20 criou policy em congregation_admins usando
-- get_my_congregation_ids(), que retorna VAZIO para admin_general (eles não
-- têm entradas em congregation_admins). Isso bloqueou o acesso do super admin
-- a todos os membros, quebrando o carregamento de capitães.
--
-- Fix: adicionar policy separada para admin_general lendo tudo, usando
-- get_my_profile() (já SECURITY DEFINER) para evitar recursão.

-- ── 1. Policy para admin_general ler todos os congregation_admins ─────────────
CREATE POLICY "Admin general can read all congregation members"
  ON public.congregation_admins FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile() LIMIT 1) = 'admin_general'
  );

-- ── 2. Recria função RPC (garante existência após v21) ────────────────────────
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
