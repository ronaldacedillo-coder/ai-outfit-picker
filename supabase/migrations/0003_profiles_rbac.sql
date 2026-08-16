-- Three-tier RBAC foundation: role enum, profiles table, and a
-- security-definer role-lookup helper that later policies (on profiles
-- itself, clothing_items, matching_overrides, and storage) all reuse.
--
-- The helper is required, not just convenient: an RLS policy on `profiles`
-- that subqueries `profiles` again (e.g. "admin can read every row") would
-- otherwise trigger Postgres's "infinite recursion detected in policy"
-- error. A `security definer` function sidesteps that by running with the
-- function owner's privileges, bypassing RLS internally for this one
-- narrow read.

do $$
begin
  create type public.user_role as enum ('ADMIN', 'STORE', 'CUSTOMER');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'CUSTOMER',
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- No UPDATE/DELETE policy: role changes are out of scope for this pass.
-- Only the trigger added in 0004 (security definer, bypasses RLS) writes
-- to this table.
drop policy if exists "profiles: self select" on public.profiles;
create policy "profiles: self select"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles: admin select all" on public.profiles;
create policy "profiles: admin select all"
on public.profiles for select
to authenticated
using (public.current_user_role() = 'ADMIN');
