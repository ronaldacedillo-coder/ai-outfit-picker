-- Data migration, not just schema: reassigns existing clothing_items rows
-- (currently owned by whichever scattered non-admin test accounts created
-- them) to the first ADMIN account, so they survive the ownership pivot
-- in 0005 as seed catalog content instead of being orphaned.
--
-- IMPORTANT -- REAL-WORLD ORDERING DEPENDENCY: this must be run only
-- AFTER the first real ADMIN account has actually signed up through the
-- app (migrations 0003/0004 applied, and at least one profiles row with
-- role = 'ADMIN' exists). Running it before any admin exists is a safe
-- no-op -- there is nothing to reassign to yet -- but it will not
-- retroactively fix anything unless re-run after an admin shows up. Apply
-- this one manually, after confirming an admin account exists, not
-- automatically alongside the rest of the migration batch.

do $$
declare
  first_admin_id uuid;
begin
  select id into first_admin_id
  from public.profiles
  where role = 'ADMIN'
  order by created_at asc
  limit 1;

  if first_admin_id is not null then
    update public.clothing_items
    set user_id = first_admin_id
    where user_id is distinct from first_admin_id;
  end if;
end $$;
