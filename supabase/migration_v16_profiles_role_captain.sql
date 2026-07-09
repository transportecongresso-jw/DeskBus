-- migration_v16: Adiciona 'captain' ao CHECK constraint de profiles.role
--
-- O tipo UserRole foi expandido para incluir 'captain', mas o constraint
-- do banco não foi atualizado, causando erro ao criar perfis de capitão.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin_general', 'admin_congregation', 'captain'));
