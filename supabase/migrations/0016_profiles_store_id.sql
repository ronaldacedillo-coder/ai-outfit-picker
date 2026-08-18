-- Store-user association (Part 6/7 of the ARROW expansion spec). A STORE
-- profile's store_id is the authorization boundary for every inventory RLS
-- policy from here on -- it must never be settable by the client. The only
-- write path is the admin-only UPDATE policy added below, exercised through
-- a server action that itself re-derives the caller's own role via
-- requireRole(["ADMIN"]) before ever touching this column (defense in depth:
-- RLS is the real boundary, the server action is a second check).
--
-- Nullable and meaningless for ADMIN/CUSTOMER profiles -- only STORE-role
-- profiles are expected to have a non-null store_id.
alter table public.profiles
  add column if not exists store_id uuid references public.stores(id);

-- security definer, mirroring current_user_role() exactly (same file,
-- migration 0003) -- avoids the recursive-RLS problem a normal query would
-- hit if a stores/inventory policy tried to read profiles.store_id directly
-- under RLS while also being the thing gating access to profiles.
create or replace function public.current_user_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.profiles where id = auth.uid();
$$;

-- profiles previously had no UPDATE policy at all (a pre-existing gap, not
-- introduced here) -- meaning no client-facing path existed to assign a
-- store, or to change anyone's role after signup. This is the minimum
-- policy needed for admin-driven store assignment; it also happens to fix
-- the separate "no role-change mechanism" gap, since the same UPDATE now
-- covers the role column too. Still ADMIN-only -- a STORE or CUSTOMER user
-- can never update any profile, including their own.
drop policy if exists "profiles: admin update" on public.profiles;
create policy "profiles: admin update"
on public.profiles for update
to authenticated
using (current_user_role() = 'ADMIN')
with check (current_user_role() = 'ADMIN');
