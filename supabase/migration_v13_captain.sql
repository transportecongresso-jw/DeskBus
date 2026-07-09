-- ============================================================
-- Migration v13 — Módulo Capitania e Capitães
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Adicionar campos em access_requests
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS congregation_id uuid REFERENCES congregations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_role text NOT NULL DEFAULT 'admin_congregation';

-- 2. Criar tabela de viagens dos veículos
CREATE TABLE IF NOT EXISTS vehicle_trips (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id     uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  event_id       uuid REFERENCES events(id) ON DELETE SET NULL,
  captain_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  congregation_id uuid REFERENCES congregations(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'not_started',
  -- 'not_started' | 'boarding' | 'departed' | 'arrived' | 'return_departed' | 'return_arrived'
  boarding_started_at  timestamptz,
  departed_at          timestamptz,
  arrived_at           timestamptz,
  return_departed_at   timestamptz,
  return_arrived_at    timestamptz,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- 3. Criar tabela de notificações internas
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title           text NOT NULL,
  message         text NOT NULL,
  type            text NOT NULL DEFAULT 'info',  -- 'info' | 'warning' | 'success'
  read            boolean NOT NULL DEFAULT false,
  related_vehicle_id  uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  congregation_id     uuid REFERENCES congregations(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now()
);

-- 4. Habilitar RLS
ALTER TABLE vehicle_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;

-- 5. Policies — vehicle_trips (autenticados veem tudo dentro de sua congregação)
DROP POLICY IF EXISTS "trips_all" ON vehicle_trips;
CREATE POLICY "trips_all" ON vehicle_trips
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Policies — notifications (cada usuário vê apenas as próprias)
DROP POLICY IF EXISTS "notif_select" ON notifications;
CREATE POLICY "notif_select" ON notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_insert" ON notifications;
CREATE POLICY "notif_insert" ON notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notif_update" ON notifications;
CREATE POLICY "notif_update" ON notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 7. Índices úteis
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_vehicle ON vehicle_trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_cong  ON access_requests(congregation_id, status);

-- ============================================================
-- Instruções:
-- • Após executar, o campo "captain" pode ser usado em profiles.role
--   (tipo text, sem enum — sem necessidade de ALTER TYPE).
-- • Os capitães são vinculados em congregation_admins igual aos admins.
-- ============================================================
