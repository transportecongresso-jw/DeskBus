-- migration_v24: Permite admins de congregação inserir membros na própria congregação
--
-- Problema raiz: congregation_admins só tinha policy FOR ALL para admin_general
-- e FOR SELECT para o próprio usuário. Nenhuma policy de INSERT para
-- admin_congregation existia.
--
-- Efeito: quando congregation admin aprovava um capitão, o INSERT em
-- congregation_admins falhava silenciosamente (sem tratamento de erro no
-- frontend). O capitão ficava criado no auth mas sem vínculo com a congregação,
-- tornando-o invisível na tela de gerenciamento de capitães.
--
-- Fix: policy de INSERT usando get_my_congregation_ids() (SECURITY DEFINER)
-- para evitar recursão, permitindo que admins de congregação vinculem usuários
-- à sua própria congregação.

CREATE POLICY "Congregation admin can add members to own congregation"
  ON public.congregation_admins FOR INSERT TO authenticated
  WITH CHECK (
    congregation_id IN (SELECT public.get_my_congregation_ids())
  );
