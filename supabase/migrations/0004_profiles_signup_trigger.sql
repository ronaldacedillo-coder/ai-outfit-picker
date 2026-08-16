-- Creates the profiles row for a new auth.users row inside the same
-- transaction GoTrue uses for signup, so the two can never drift out of
-- sync (no session exists yet at signup time -- this app requires email
-- confirmation -- so a follow-up "create user, then separately insert a
-- profile" server-side step would have no authenticated session and no
-- service-role client to do it with).
--
-- Trusts new.raw_user_meta_data->>'role' unconditionally, which is only
-- safe because the calling server action (src/app/signup/actions.ts)
-- validates the ADMIN/STORE signup code BEFORE ever calling
-- supabase.auth.signUp() -- never after, never client-side. Any
-- unrecognized role value here falls back to CUSTOMER rather than
-- erroring, so a malformed/missing value can never grant elevated access.
--
-- CORRECTED after first deploy: this trigger uses the conventional name
-- `on_auth_user_created`, which turned out to already be in use by a
-- pre-existing (pre-RBAC, not tracked in any migration) trigger that
-- populated a `public.users` table -- clothing_items.user_id and
-- outfits.user_id both have a foreign key to that table, not directly to
-- auth.users. The first version of this migration silently replaced that
-- trigger and broke every catalog/outfit insert for any newly created
-- account (discovered via a 23503 foreign-key-violation on
-- clothing_items_user_id_fkey during verification). This version restores
-- that behavior by inserting into both tables from one trigger.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  submitted_role text := new.raw_user_meta_data ->> 'role';
  resolved_role public.user_role;
begin
  if submitted_role in ('ADMIN', 'STORE', 'CUSTOMER') then
    resolved_role := submitted_role::public.user_role;
  else
    resolved_role := 'CUSTOMER';
  end if;

  insert into public.users (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;

  insert into public.profiles (id, role, display_name)
  values (new.id, resolved_role, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
