-- Pivots clothing_items from a per-user-owned private wardrobe to a
-- single ADMIN-managed shared catalog: ADMIN gets full CRUD, STORE and
-- CUSTOMER get SELECT-only access to the whole catalog (no longer
-- filtered by user_id -- user_id is repurposed as "curated by this admin"
-- bookkeeping, not a visibility boundary).
--
-- The old per-user policy names aren't tracked anywhere in version
-- control (this repo has no prior table-schema migrations), so rather
-- than guessing at exact names, every existing policy on this table is
-- dropped generically via pg_policies before the new ones are created.

alter table public.clothing_items enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'clothing_items'
  loop
    execute format('drop policy if exists %I on public.clothing_items', pol.policyname);
  end loop;
end $$;

create policy "clothing_items: select for all authenticated"
on public.clothing_items for select
to authenticated
using (true);

create policy "clothing_items: admin insert"
on public.clothing_items for insert
to authenticated
with check (public.current_user_role() = 'ADMIN');

create policy "clothing_items: admin update"
on public.clothing_items for update
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

create policy "clothing_items: admin delete"
on public.clothing_items for delete
to authenticated
using (public.current_user_role() = 'ADMIN');
