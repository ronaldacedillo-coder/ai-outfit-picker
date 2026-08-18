-- Phase 1 of the ARROW Digital Styling + Store Intelligence expansion.
-- Purely additive: a new `stores` entity, unrelated to any existing table.
-- No existing data is touched by this migration.

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  store_code text not null unique,
  store_name text not null,
  region text,
  city text,
  address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  manager_name text,
  manager_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stores enable row level security;

-- ADMIN: full CRUD, matching the existing clothing_items admin-CRUD shape.
drop policy if exists "stores: admin full access" on public.stores;
create policy "stores: admin full access"
on public.stores for all
to authenticated
using (current_user_role() = 'ADMIN')
with check (current_user_role() = 'ADMIN');

-- The "STORE user reads their own store" policy is added in migration 0017,
-- after current_user_store_id() exists (0016) -- a policy can't reference a
-- function that hasn't been created yet when migrations run in order.
