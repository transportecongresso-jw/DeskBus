-- migration_v25: Remove policy INSERT recursiva e cria função SECURITY DEFINER
--
-- Problema: a policy INSERT da v24 usava get_my_congregation_ids() que
-- referencia congregation_admins. PostgreSQL detecta isso como "infinite
-- recursion" porque já está avaliando uma policy dessa mesma tabela.
--
-- Solução definitiva: remover a policy de INSERT e substituir por uma função
-- SECURITY DEFINER. Dentro de funções SD o superusuário (postgres) executa
-- sem RLS, então não há recursão. A função valida autorização explicitamente.

-- ── 1. Remove a policy recursiva ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Congregation admin can add members to own congregation"
  ON public.congregation_admins;

-- ── 2. Função SECURITY DEFINER para vincular usuário a congregação ────────────
CREATE OR REPLACE FUNCTION public.link_user_to_congregation(
  p_user_id       uuid,
  p_congregation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  is_caller_in_cong boolean;
BEGIN
  -- Obtém role do chamador (sem RLS — SECURITY DEFINER)
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role = 'admin_general' THEN
    -- Super admin pode vincular qualquer usuário a qualquer congregação
    NULL;
  ELSIF caller_role IN ('admin_congregation', 'captain') THEN
    -- Verifica se o chamador pertence à congregação alvo
    SELECT EXISTS(
      SELECT 1 FROM public.congregation_admins
      WHERE user_id = auth.uid() AND congregation_id = p_congregation_id
    ) INTO is_caller_in_cong;

    IF NOT is_caller_in_cong THEN
      RAISE EXCEPTION 'Sem permissão para vincular usuário a esta congregação';
    END IF;
  ELSE
    RAISE EXCEPTION 'Perfil sem permissão para vincular usuários';
  END IF;

  -- Insere sem RLS (SECURITY DEFINER) — sem recursão
  INSERT INTO public.congregation_admins (user_id, congregation_id)
  VALUES (p_user_id, p_congregation_id)
  ON CONFLICT DO NOTHING;
END;
$$;
