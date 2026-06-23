-- migration_v9: função pública de disponibilidade entre congregações
-- Permite que qualquer usuário autenticado consulte disponibilidade de vagas
-- de TODAS as congregações de um evento, sem expor dados pessoais.
-- Usa SECURITY DEFINER para bypassar o RLS dos veículos.

CREATE OR REPLACE FUNCTION public.get_event_availability(p_event_id uuid)
RETURNS TABLE (
  vehicle_id        uuid,
  vehicle_name      text,
  congregation_id   uuid,
  congregation_name text,
  congregation_city text,
  event_day_id      uuid,
  capacity          integer,
  assigned_count    bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id            AS vehicle_id,
    v.name          AS vehicle_name,
    c.id            AS congregation_id,
    c.name          AS congregation_name,
    c.city          AS congregation_city,
    v.event_day_id,
    v.capacity,
    COALESCE(
      (SELECT COUNT(*)
       FROM seat_assignments sa
       WHERE sa.vehicle_id = v.id
         AND sa.status = 'active'),
      0
    )               AS assigned_count
  FROM vehicles v
  JOIN congregations c ON c.id = v.congregation_id
  WHERE v.event_id = p_event_id
  ORDER BY c.name, v.name;
$$;

-- Garantir que usuários autenticados possam executar a função
GRANT EXECUTE ON FUNCTION public.get_event_availability(uuid) TO authenticated;
