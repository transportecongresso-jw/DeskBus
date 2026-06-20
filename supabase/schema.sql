-- ============================================================
-- DeskBus — Supabase Schema
-- Execute este arquivo no SQL Editor do seu projeto Supabase
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin_general', 'admin_congregation')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Profiles RLS
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admin general can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin_general'
    )
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'admin_congregation')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- CONGREGATIONS
-- ============================================================
create table public.congregations (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  city text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.congregations enable row level security;

create policy "Admin general full access to congregations"
  on public.congregations for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
  );

create policy "Congregation admin can read own congregation"
  on public.congregations for select
  using (
    exists (
      select 1 from public.congregation_admins ca
      where ca.congregation_id = id and ca.user_id = auth.uid()
    )
  );

-- ============================================================
-- CONGREGATION ADMINS
-- ============================================================
create table public.congregation_admins (
  id uuid default uuid_generate_v4() primary key,
  congregation_id uuid references public.congregations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(congregation_id, user_id)
);

alter table public.congregation_admins enable row level security;

create policy "Admin general full access"
  on public.congregation_admins for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
  );

create policy "Users can read own admin assignments"
  on public.congregation_admins for select
  using (user_id = auth.uid());

-- ============================================================
-- VEHICLES
-- ============================================================
create table public.vehicles (
  id uuid default uuid_generate_v4() primary key,
  congregation_id uuid references public.congregations(id) on delete cascade not null,
  type text not null check (type in ('bus', 'van')),
  capacity integer not null check (capacity > 0),
  name text not null,
  ticket_price numeric(10,2) default 0,
  export_count integer default 0,
  exported_at timestamptz,
  created_at timestamptz default now()
);

alter table public.vehicles enable row level security;

create policy "Admin general full access to vehicles"
  on public.vehicles for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
  );

create policy "Congregation admin access to own vehicles"
  on public.vehicles for all
  using (
    exists (
      select 1 from public.congregation_admins ca
      where ca.congregation_id = congregation_id and ca.user_id = auth.uid()
    )
  );

-- ============================================================
-- SEATS
-- ============================================================
create table public.seats (
  id uuid default uuid_generate_v4() primary key,
  vehicle_id uuid references public.vehicles(id) on delete cascade not null,
  seat_number integer not null,
  row_number integer not null,
  column_position integer not null,
  is_driver boolean default false,
  created_at timestamptz default now(),
  unique(vehicle_id, seat_number)
);

alter table public.seats enable row level security;

create policy "Authenticated users can read seats"
  on public.seats for select
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
      and (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
        or
        exists (select 1 from public.congregation_admins ca where ca.congregation_id = v.congregation_id and ca.user_id = auth.uid())
      )
    )
  );

create policy "Congregation admin can manage seats"
  on public.seats for all
  using (
    exists (
      select 1 from public.vehicles v
      join public.congregation_admins ca on ca.congregation_id = v.congregation_id
      where v.id = vehicle_id and ca.user_id = auth.uid()
    )
    or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
  );

-- ============================================================
-- PASSENGERS
-- ============================================================
create table public.passengers (
  id uuid default uuid_generate_v4() primary key,
  congregation_id uuid references public.congregations(id) on delete cascade not null,
  full_name text not null,
  document_type text not null check (document_type in ('cpf', 'rg', 'birth_certificate')),
  document_number text not null,
  is_minor boolean default false,
  guardian_id uuid references public.passengers(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.passengers enable row level security;

create policy "Admin general full access to passengers"
  on public.passengers for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
  );

create policy "Congregation admin access to own passengers"
  on public.passengers for all
  using (
    exists (
      select 1 from public.congregation_admins ca
      where ca.congregation_id = congregation_id and ca.user_id = auth.uid()
    )
  );

-- ============================================================
-- SEAT ASSIGNMENTS
-- ============================================================
create table public.seat_assignments (
  id uuid default uuid_generate_v4() primary key,
  seat_id uuid references public.seats(id) on delete cascade not null,
  passenger_id uuid references public.passengers(id) on delete cascade not null,
  vehicle_id uuid references public.vehicles(id) on delete cascade not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('paid', 'pending')),
  boarding_status text not null default 'pending' check (boarding_status in ('boarded', 'not_boarded', 'pending')),
  boarding_observation text,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.seat_assignments enable row level security;

create policy "Admin general full access to assignments"
  on public.seat_assignments for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
  );

create policy "Congregation admin access to own assignments"
  on public.seat_assignments for all
  using (
    exists (
      select 1 from public.vehicles v
      join public.congregation_admins ca on ca.congregation_id = v.congregation_id
      where v.id = vehicle_id and ca.user_id = auth.uid()
    )
  );

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_seat_assignment_updated
  before update on public.seat_assignments
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- AUDIT LOGS
-- ============================================================
create table public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  congregation_id uuid references public.congregations(id) on delete cascade,
  action_type text not null,
  description text not null,
  performed_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.audit_logs enable row level security;

create policy "Admin general can read all audit logs"
  on public.audit_logs for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
  );

create policy "Congregation admin can read own audit logs"
  on public.audit_logs for select
  using (
    exists (
      select 1 from public.congregation_admins ca
      where ca.congregation_id = congregation_id and ca.user_id = auth.uid()
    )
  );

create policy "Authenticated users can insert audit logs"
  on public.audit_logs for insert
  with check (performed_by = auth.uid());

-- ============================================================
-- EXPORT RECORDS
-- ============================================================
create table public.export_records (
  id uuid default uuid_generate_v4() primary key,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  congregation_id uuid references public.congregations(id) on delete cascade,
  export_type text not null check (export_type in ('excel', 'pdf')),
  exported_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.export_records enable row level security;

create policy "Admin general full access to export records"
  on public.export_records for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin_general')
  );

create policy "Congregation admin access to own export records"
  on public.export_records for all
  using (
    exists (
      select 1 from public.congregation_admins ca
      where ca.congregation_id = congregation_id and ca.user_id = auth.uid()
    )
  );

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index idx_congregation_admins_user on public.congregation_admins(user_id);
create index idx_congregation_admins_congregation on public.congregation_admins(congregation_id);
create index idx_vehicles_congregation on public.vehicles(congregation_id);
create index idx_seats_vehicle on public.seats(vehicle_id);
create index idx_passengers_congregation on public.passengers(congregation_id);
create index idx_passengers_guardian on public.passengers(guardian_id);
create index idx_seat_assignments_vehicle on public.seat_assignments(vehicle_id);
create index idx_seat_assignments_passenger on public.seat_assignments(passenger_id);
create index idx_seat_assignments_status on public.seat_assignments(status);
create index idx_audit_logs_vehicle on public.audit_logs(vehicle_id);
create index idx_export_records_vehicle on public.export_records(vehicle_id);
