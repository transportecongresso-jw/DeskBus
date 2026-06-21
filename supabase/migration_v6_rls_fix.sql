-- =====================================================
-- Migration v6: CORREÇÃO CRÍTICA DE ISOLAMENTO RLS
--
-- PROBLEMA: As políticas abaixo usavam referência ambígua de coluna.
-- Ex: WHERE ca.congregation_id = congregation_id
--     → o PostgreSQL resolve "congregation_id" como ca.congregation_id
--     → torna-se ca.congregation_id = ca.congregation_id → sempre TRUE
--     → qualquer admin de congregação via dados de TODAS as congregações
--
-- SOLUÇÃO: Qualificar explicitamente com o nome da tabela alvo.
--
-- Execute este script COMPLETO no SQL Editor do Supabase.
-- =====================================================

-- ============================================================
-- 1. CONGREGAÇÕES
-- ============================================================
DROP POLICY IF EXISTS "Congregation admin can read own congregation" ON public.congregations;
CREATE POLICY "Congregation admin can read own congregation"
  ON public.congregations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = congregations.id
      AND ca.user_id = auth.uid()
  ));

-- ============================================================
-- 2. VEÍCULOS
-- ============================================================
DROP POLICY IF EXISTS "Congregation admin access to own vehicles" ON public.vehicles;
CREATE POLICY "Congregation admin access to own vehicles"
  ON public.vehicles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = vehicles.congregation_id
      AND ca.user_id = auth.uid()
  ));

-- ============================================================
-- 3. PASSAGEIROS
-- ============================================================
DROP POLICY IF EXISTS "Congregation admin access to own passengers" ON public.passengers;
CREATE POLICY "Congregation admin access to own passengers"
  ON public.passengers FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = passengers.congregation_id
      AND ca.user_id = auth.uid()
  ));

-- ============================================================
-- 4. AUDIT LOGS
-- ============================================================
DROP POLICY IF EXISTS "Congregation admin can read own audit logs" ON public.audit_logs;
CREATE POLICY "Congregation admin can read own audit logs"
  ON public.audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = audit_logs.congregation_id
      AND ca.user_id = auth.uid()
  ));

-- ============================================================
-- 5. EXPORT RECORDS
-- ============================================================
DROP POLICY IF EXISTS "Congregation admin access to own export records" ON public.export_records;
CREATE POLICY "Congregation admin access to own export records"
  ON public.export_records FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = export_records.congregation_id
      AND ca.user_id = auth.uid()
  ));

-- ============================================================
-- 6. AVALIAÇÕES DE VEÍCULOS (migration_v5)
-- ============================================================
DROP POLICY IF EXISTS "Congregation admin can manage own ratings" ON public.vehicle_ratings;
CREATE POLICY "Congregation admin can manage own ratings"
  ON public.vehicle_ratings FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = vehicle_ratings.congregation_id
      AND ca.user_id = auth.uid()
  ));

-- ============================================================
-- 7. NOTAS FISCAIS (migration_v5)
-- ============================================================
DROP POLICY IF EXISTS "Congregation admin can manage own invoices" ON public.invoices;
CREATE POLICY "Congregation admin can manage own invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.congregation_admins ca
    WHERE ca.congregation_id = invoices.congregation_id
      AND ca.user_id = auth.uid()
  ));

-- ============================================================
-- 8. COLUMN phone em profiles (caso não tenha sido adicionada)
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============================================================
-- 9. VERIFICAÇÃO (opcional — rode após aplicar)
-- Deve retornar todas as políticas de congregação corretas:
-- ============================================================
-- SELECT schemaname, tablename, policyname, qual
-- FROM pg_policies
-- WHERE policyname LIKE 'Congregation admin%'
-- ORDER BY tablename;
