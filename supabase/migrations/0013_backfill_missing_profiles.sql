-- Backfills profiles rows for auth.users accounts that predate the RBAC
-- signup trigger (migration 0004), which only fires on new inserts to
-- auth.users -- it never ran for anyone who signed up before it
-- existed. A missing profiles row makes requireRole() return null for
-- that user on every role-gated page, producing an infinite redirect
-- loop between /dashboard and /catalog (each bounces to the other when
-- the caller has no resolvable role) -- confirmed live: a real customer
-- account created two days before this trigger was deployed could log
-- in successfully but could never open any page afterward, which a
-- browser surfaces as a redirect-loop error ("cannot open the
-- website").
--
-- Mirrors handle_new_user()'s own role-resolution logic exactly (falls
-- back to CUSTOMER for anything unrecognized/missing, same as new
-- signups), and is idempotent via on conflict do nothing.

insert into public.profiles (id, role, display_name)
select
  au.id,
  case
    when au.raw_user_meta_data ->> 'role' in ('ADMIN', 'STORE', 'CUSTOMER')
      then (au.raw_user_meta_data ->> 'role')::public.user_role
    else 'CUSTOMER'::public.user_role
  end,
  au.raw_user_meta_data ->> 'display_name'
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null
on conflict (id) do nothing;
