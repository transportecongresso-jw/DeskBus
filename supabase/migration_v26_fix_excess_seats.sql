-- migration_v26: Remove assentos excedentes (seat_number > vehicle.capacity)
-- sem reserva ativa, causados por edição de capacidade com passageiros bloqueando
-- a remoção no frontend (o código saía cedo sem atualizar a capacidade nem os assentos).

DELETE FROM public.seats s
USING public.vehicles v
WHERE s.vehicle_id = v.id
  AND s.seat_number > v.capacity
  AND NOT EXISTS (
    SELECT 1 FROM public.seat_assignments sa
    WHERE sa.seat_id = s.id AND sa.status = 'active'
  );
