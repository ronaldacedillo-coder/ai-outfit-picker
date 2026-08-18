-- The inventory-tracked variant layer (Part 5 of the ARROW expansion spec).
-- clothing_items remains, unchanged, the parent/visual product that the
-- styling engine (matching, FLUX, My Looks) has always referenced -- this
-- table is purely additive, one row per sellable physical variant.
--
-- Variant columns are a deliberate placeholder shape, confirmed with the
-- project owner: separate style/fit columns (not merged), waist_size for
-- pants/trousers, plain size for shirts/polos/jackets/blazers, plus an
-- `attributes` catch-all for whatever ARROW's real inventory system turns
-- out to track that isn't one of the named columns yet. None of this is
-- final -- it's designed to be renamed or extended without breaking
-- anything once ARROW provides a real data sample; nothing else in the
-- schema references these columns directly, only product_skus.id, so this
-- table is the only one that will need to change shape.
create table if not exists public.product_skus (
  id uuid primary key default gen_random_uuid(),
  clothing_item_id uuid not null references public.clothing_items(id),
  sku text not null unique,
  size text,
  style text,
  fit text,
  waist_size text,
  length text,
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'discontinued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_skus_clothing_item_id_idx
  on public.product_skus (clothing_item_id);

alter table public.product_skus enable row level security;

-- Mirrors clothing_items' RLS shape exactly: it's still shared catalog
-- data (every authenticated role can browse it), only ADMIN can author it.
drop policy if exists "product_skus: select for all authenticated" on public.product_skus;
create policy "product_skus: select for all authenticated"
on public.product_skus for select
to authenticated
using (true);

drop policy if exists "product_skus: admin insert" on public.product_skus;
create policy "product_skus: admin insert"
on public.product_skus for insert
to authenticated
with check (current_user_role() = 'ADMIN');

drop policy if exists "product_skus: admin update" on public.product_skus;
create policy "product_skus: admin update"
on public.product_skus for update
to authenticated
using (current_user_role() = 'ADMIN')
with check (current_user_role() = 'ADMIN');

drop policy if exists "product_skus: admin delete" on public.product_skus;
create policy "product_skus: admin delete"
on public.product_skus for delete
to authenticated
using (current_user_role() = 'ADMIN');
