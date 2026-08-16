-- Admin-curated matching overrides: lets an ADMIN pin a specific
-- combination (item-to-item or category-to-category) that should always
-- outrank the deterministic/AI matching engine for a given item, optionally
-- scoped to an occasion/style context. Directional by default (base ->
-- matched); `reciprocal` lets a single authored rule apply in both
-- directions at query time instead of requiring two mirrored rows that
-- could drift out of sync on edit.
--
-- Precedence when multiple rules could apply to the same base item is
-- resolved in application code (src/lib/matching/matchingOverrides.ts),
-- not in SQL: item-level beats category-level, then higher `priority`,
-- then an exact occasion/style_context match beats a catch-all (null) rule.

create table if not exists public.matching_overrides (
  id uuid primary key default gen_random_uuid(),
  base_item_id uuid references public.clothing_items(id) on delete cascade,
  base_category_id integer references public.clothing_categories(id),
  base_subcategory_id integer references public.clothing_subcategories(id),
  matched_item_id uuid references public.clothing_items(id) on delete cascade,
  matched_category_id integer references public.clothing_categories(id),
  matched_subcategory_id integer references public.clothing_subcategories(id),
  reciprocal boolean not null default false,
  occasion text,
  style_context text,
  priority integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint matching_overrides_base_specified
    check (base_item_id is not null or (base_category_id is not null and base_subcategory_id is not null)),
  constraint matching_overrides_matched_specified
    check (matched_item_id is not null or (matched_category_id is not null and matched_subcategory_id is not null))
);

alter table public.matching_overrides enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'matching_overrides'
  loop
    execute format('drop policy if exists %I on public.matching_overrides', pol.policyname);
  end loop;
end $$;

-- Rule authorship stays fully admin-only: no SELECT policy is granted to
-- STORE/CUSTOMER here. Non-admin sessions resolve recommendations through
-- the security-definer get_applicable_overrides() RPC below instead of
-- querying this table directly.
create policy "matching_overrides: admin select"
on public.matching_overrides for select
to authenticated
using (public.current_user_role() = 'ADMIN');

create policy "matching_overrides: admin insert"
on public.matching_overrides for insert
to authenticated
with check (public.current_user_role() = 'ADMIN');

create policy "matching_overrides: admin update"
on public.matching_overrides for update
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

create policy "matching_overrides: admin delete"
on public.matching_overrides for delete
to authenticated
using (public.current_user_role() = 'ADMIN');

-- security definer so STORE/CUSTOMER (who have no SELECT policy on the
-- table itself) can still resolve which rules apply to a given item,
-- without exposing raw table access or rule authorship (created_by).
create or replace function public.get_applicable_overrides(
  p_item_id uuid,
  p_category_id integer,
  p_subcategory_id integer,
  p_occasion text default null,
  p_style_context text default null
)
returns setof public.matching_overrides
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.matching_overrides
  where (
    -- Forward direction always applies.
    base_item_id = p_item_id
    or (base_category_id = p_category_id and base_subcategory_id = p_subcategory_id)
    -- Reverse direction only applies when the rule was authored as reciprocal.
    or (
      reciprocal
      and (
        matched_item_id = p_item_id
        or (matched_category_id = p_category_id and matched_subcategory_id = p_subcategory_id)
      )
    )
  )
  and (occasion is null or occasion = p_occasion)
  and (style_context is null or style_context = p_style_context);
$$;

grant execute on function public.get_applicable_overrides(uuid, integer, integer, text, text) to authenticated;
