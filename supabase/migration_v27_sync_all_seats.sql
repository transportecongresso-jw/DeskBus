-- migration_v27: Sincronização completa de assentos para todos os veículos
--
-- Problema: divergência entre vehicles.capacity e a contagem real de linhas
-- na tabela seats. Pode ocorrer por:
--   a) veículo criado com capacidade padrão 46, depois editado para menos com
--      passageiros bloqueando a remoção — o código saía cedo sem sincronizar.
--   b) mudança de tipo (van→bus) sem regenerar posições.
--
-- Esta migration:
--   1. Remove assentos com seat_number > capacity SEM reserva ativa.
--   2. Insere assentos faltantes (1..capacity) para veículos com deficit.
--   3. Atualiza row_number e column_position de acordo com o tipo atual.

-- ─── 1. Remover assentos excedentes sem reserva ativa ────────────────────────
DELETE FROM public.seats s
USING public.vehicles v
WHERE s.vehicle_id = v.id
  AND s.seat_number > v.capacity
  AND NOT EXISTS (
    SELECT 1 FROM public.seat_assignments sa
    WHERE sa.seat_id = s.id AND sa.status = 'active'
  );

-- ─── 2. Inserir assentos faltantes ───────────────────────────────────────────
INSERT INTO public.seats (vehicle_id, seat_number, row_number, column_position, is_driver)
SELECT
  v.id                                                           AS vehicle_id,
  gs.n                                                           AS seat_number,
  CEIL(gs.n::numeric / CASE v.type WHEN 'van' THEN 3 ELSE 4 END)::int AS row_number,
  ((gs.n - 1) % CASE v.type WHEN 'van' THEN 3 ELSE 4 END + 1)::int   AS column_position,
  false                                                          AS is_driver
FROM public.vehicles v
CROSS JOIN LATERAL generate_series(1, v.capacity) AS gs(n)
WHERE NOT EXISTS (
  SELECT 1 FROM public.seats s
  WHERE s.vehicle_id = v.id AND s.seat_number = gs.n
);

-- ─── 3. Corrigir row_number / column_position em assentos existentes ─────────
UPDATE public.seats s
SET
  row_number       = CEIL(s.seat_number::numeric / CASE v.type WHEN 'van' THEN 3 ELSE 4 END)::int,
  column_position  = ((s.seat_number - 1) % CASE v.type WHEN 'van' THEN 3 ELSE 4 END + 1)::int
FROM public.vehicles v
WHERE s.vehicle_id = v.id;
