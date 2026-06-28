-- migration_v12: Suporte a micro-ônibus e acessibilidade para cadeirantes
--
-- 1. Adiciona 'microbus' ao tipo de veículo
-- 2. Adiciona coluna wheelchair_accessible em vehicles
-- 3. Adiciona coluna is_wheelchair_user em passengers

-- ─────────────────────────────────────────────────────────────────
-- VEÍCULOS: novo tipo e campo de acessibilidade
-- ─────────────────────────────────────────────────────────────────

-- Remove a constraint existente (criada inline no CREATE TABLE)
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_type_check;

-- Recria incluindo microbus
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_type_check
  CHECK (type IN ('bus', 'van', 'microbus'));

-- Campo indicando se o veículo tem adaptação para cadeirantes
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS wheelchair_accessible boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────
-- PASSAGEIROS: campo indicando se é cadeirante
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.passengers
  ADD COLUMN IF NOT EXISTS is_wheelchair_user boolean NOT NULL DEFAULT false;
