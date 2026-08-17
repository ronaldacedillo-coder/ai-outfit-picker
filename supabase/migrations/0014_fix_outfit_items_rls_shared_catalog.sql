-- Fixes a real bug: the outfit_items RLS policy still required
-- clothing_items.user_id = auth.uid(), a leftover from the pre-RBAC
-- per-user-wardrobe model. Since migration 0005 pivoted clothing_items
-- to a single shared, admin-owned catalog, that clause has been false
-- for nearly every real generation (any STORE/CUSTOMER user, and any
-- ADMIN other than the one specific "first admin" account that owns
-- the catalog rows) -- silently rejecting every outfit_items insert,
-- which the calling code never checked the error on. Confirmed live:
-- outfit_items has been completely empty across every real generation
-- since the RBAC pivot.
--
-- Fix: outfit_items only needs to be scoped to "this outfit belongs to
-- me" (via the outfits FK) -- clothing_items ownership is irrelevant
-- now that the catalog is shared and readable by any authenticated
-- role. Dropping that clause doesn't loosen anything meaningful: it
-- only ever gated whether a user could record which shared, already-
-- readable catalog item was used, never sensitive data.

drop policy if exists "users can manage own outfit items" on public.outfit_items;

create policy "users can manage own outfit items"
on public.outfit_items
for all
using (
  exists (
    select 1 from public.outfits o
    where o.id = outfit_items.outfit_id and o.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.outfits o
    where o.id = outfit_items.outfit_id and o.user_id = auth.uid()
  )
);
