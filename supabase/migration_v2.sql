-- ============================================================
-- DeskBus — Migration v2
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar status de finalização nas congregações
alter table public.congregations
  add column if not exists list_status text not null default 'in_progress'
    check (list_status in ('in_progress', 'finalized')),
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references public.profiles(id);

-- 2. Expandir audit_logs com action_type mais detalhado
-- (tabela já existe, apenas garantir que funciona para todos os casos)

-- 3. Adicionar coluna de substitution na seat_assignments
alter table public.seat_assignments
  add column if not exists substituted_from uuid references public.passengers(id),
  add column if not exists substitution_reason text;

-- 4. Políticas para o campo finalized_by nas congregações
-- (já coberto pelas policies existentes de admin_general e congregation_admin)

-- 5. Índices adicionais
create index if not exists idx_congregations_status on public.congregations(list_status);
create index if not exists idx_audit_logs_congregation on public.audit_logs(congregation_id);
create index if not exists idx_audit_logs_performed_by on public.audit_logs(performed_by);
