-- Completes the stores RLS from migration 0015, now that
-- current_user_store_id() exists (migration 0016). STORE users can read
-- only the single store row matching their own profile's store_id; nothing
-- for CUSTOMER (whose store_id is always null, so this policy is
-- unconditionally false for them, matching Part 67's privacy requirement).
drop policy if exists "stores: store user reads own store" on public.stores;
create policy "stores: store user reads own store"
on public.stores for select
to authenticated
using (id = current_user_store_id());
