-- migration_v11: Garante integridade de unicidade nos vínculos ativos
--
-- Problema: a tabela seat_assignments não tinha constraints de unicidade
-- para atribuições ativas, permitindo que:
--   1. Uma poltrona tivesse dois passageiros ativos ao mesmo tempo
--   2. Um passageiro tivesse dois assentos ativos no mesmo veículo
--
-- Solução: índices de unicidade PARCIAIS (só aplicam quando status = 'active'),
-- precedidos de limpeza de eventuais duplicatas já existentes.

-- ─────────────────────────────────────────────────────────────────
-- PASSO 1: remover duplicatas de poltrona (mesma seat_id, dois active)
-- Mantém o registro mais recente; cancela os demais.
-- ─────────────────────────────────────────────────────────────────
WITH ranked_seats AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY seat_id
           ORDER BY created_at DESC
         ) AS rn
  FROM public.seat_assignments
  WHERE status = 'active'
)
UPDATE public.seat_assignments
SET
  status              = 'cancelled',
  cancelled_at        = now(),
  cancellation_reason = 'Duplicata de poltrona removida automaticamente (migration_v11)'
WHERE id IN (SELECT id FROM ranked_seats WHERE rn > 1);

-- ─────────────────────────────────────────────────────────────────
-- PASSO 2: remover duplicatas de passageiro no mesmo veículo
-- (passenger_id + vehicle_id com dois active)
-- ─────────────────────────────────────────────────────────────────
WITH ranked_passengers AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY passenger_id, vehicle_id
           ORDER BY created_at DESC
         ) AS rn
  FROM public.seat_assignments
  WHERE status = 'active'
)
UPDATE public.seat_assignments
SET
  status              = 'cancelled',
  cancelled_at        = now(),
  cancellation_reason = 'Duplicata de passageiro no veículo removida automaticamente (migration_v11)'
WHERE id IN (SELECT id FROM ranked_passengers WHERE rn > 1);

-- ─────────────────────────────────────────────────────────────────
-- PASSO 3: criar os índices de unicidade parciais
-- ─────────────────────────────────────────────────────────────────

-- Uma poltrona só pode ter um passageiro ativo por vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_active
  ON public.seat_assignments(seat_id)
  WHERE status = 'active';

-- Um passageiro só pode ter um assento ativo por veículo
CREATE UNIQUE INDEX IF NOT EXISTS uq_passenger_vehicle_active
  ON public.seat_assignments(passenger_id, vehicle_id)
  WHERE status = 'active';
