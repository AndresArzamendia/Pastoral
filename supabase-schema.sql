-- Supabase schema required by Pastoral
-- Run this SQL in the Supabase SQL editor for your project.

create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_uid text not null unique,
  name text not null,
  email text not null unique,
  role text not null default 'viewer',
  status text not null default 'pendiente',
  permissions jsonb not null default '["dashboard"]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pjl_store (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_pjl_store_updated_at on public.pjl_store;
create trigger set_pjl_store_updated_at
before update on public.pjl_store
for each row execute function public.set_updated_at();

alter table public.pjl_store enable row level security;

-- Habilita realtime (empuje en vivo) para pjl_store y user_profiles.
-- Las actualizaciones de un dispositivo se ven en los demás al instante.
do $$
begin
  alter publication supabase_realtime add table public.pjl_store, public.user_profiles;
exception
  when duplicate_object then null;
end $$;

-- LECTURA pública: cualquiera (el sitio web, con la anon key) puede leer el
-- contenido. Las escrituras NO son de anon: solo de cuentas autenticadas
-- (el panel, que guarda con el token de sesión) o de service_role (scripts).
drop policy if exists "Public read pjl_store" on public.pjl_store;
create policy "Public read pjl_store"
on public.pjl_store
for select
to anon, authenticated
using (true);

drop policy if exists "Public write pjl_store" on public.pjl_store;
drop policy if exists "Authenticated insert pjl_store" on public.pjl_store;
create policy "Authenticated insert pjl_store"
on public.pjl_store
for insert
to authenticated
with check (true);

drop policy if exists "Public update pjl_store" on public.pjl_store;
drop policy if exists "Authenticated update pjl_store" on public.pjl_store;
create policy "Authenticated update pjl_store"
on public.pjl_store
for update
to authenticated
using (true)
with check (true);

alter table public.user_profiles enable row level security;

-- user_profiles: se leen y actualizan desde el panel con la sesión del usuario
-- (requireAdmin usa el token del propio usuario). El registro inserta la fila
-- con el token de la cuenta recién creada.
drop policy if exists "Public read user_profiles" on public.user_profiles;
create policy "Public read user_profiles"
on public.user_profiles
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated insert user_profiles" on public.user_profiles;
create policy "Authenticated insert user_profiles"
on public.user_profiles
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated update user_profiles" on public.user_profiles;
create policy "Authenticated update user_profiles"
on public.user_profiles
for update
to authenticated
using (true)
with check (true);
