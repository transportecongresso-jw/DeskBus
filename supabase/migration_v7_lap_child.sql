-- migration_v7: Criança de Colo (lap child) support
-- Run this in Supabase SQL Editor

-- Add birth_date column to passengers
ALTER TABLE public.passengers
  ADD COLUMN IF NOT EXISTS birth_date date;

-- Add passenger_type column (normal | lap_child)
ALTER TABLE public.passengers
  ADD COLUMN IF NOT EXISTS passenger_type text NOT NULL DEFAULT 'normal'
  CHECK (passenger_type IN ('normal', 'lap_child'));

-- Lap children should never appear as a guardian themselves
-- (enforced in the frontend, no DB constraint needed)

-- Index for faster lap_child queries in boarding page
CREATE INDEX IF NOT EXISTS idx_passengers_type
  ON public.passengers (passenger_type);

CREATE INDEX IF NOT EXISTS idx_passengers_guardian
  ON public.passengers (guardian_id);
