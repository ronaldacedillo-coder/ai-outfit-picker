-- The inventory transaction ledger and its performance read-model
-- (Parts 8/9/10/11 of the ARROW expansion spec). The ledger is the
-- authoritative record; inventory_balances is derived from it and must
-- never be written to independently -- see record_inventory_transaction()
-- below, the only path either table is written through.

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  product_sku_id uuid not null references public.product_skus(id),
  transaction_type text not null check (transaction_type in (
    'opening_balance', 'sale', 'return', 'transfer_in', 'transfer_out',
    'purchase_receipt', 'production_receipt', 'import_receipt',
    'adjustment_in', 'adjustment_out', 'damage', 'loss', 'stock_count',
    'reservation', 'release'
  )),
  quantity integer not null,
  reference_type text,
  reference_id uuid,
  previous_quantity integer not null,
  new_quantity integer not null,
  reason text,
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists inventory_transactions_store_sku_idx
  on public.inventory_transactions (store_id, product_sku_id);
create index if not exists inventory_transactions_reference_idx
  on public.inventory_transactions (reference_type, reference_id);

create table if not exists public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  product_sku_id uuid not null references public.product_skus(id),
  quantity integer not null default 0,
  reserved_quantity integer not null default 0,
  available_quantity integer generated always as (quantity - reserved_quantity) stored,
  minimum_stock integer,
  target_stock integer,
  reorder_point integer,
  updated_at timestamptz not null default now(),
  unique (store_id, product_sku_id)
);

alter table public.inventory_transactions enable row level security;
alter table public.inventory_balances enable row level security;

-- No INSERT/UPDATE/DELETE policy is granted on either table to anyone,
-- including ADMIN -- every write goes through record_inventory_transaction()
-- below (security definer, does its own authorization check), so a raw
-- client-side write is never possible even for an admin session. This is
-- the actual enforcement of Part 8's "never silently modify inventory
-- without creating a transaction."
drop policy if exists "inventory_transactions: admin select all" on public.inventory_transactions;
create policy "inventory_transactions: admin select all"
on public.inventory_transactions for select
to authenticated
using (current_user_role() = 'ADMIN');

drop policy if exists "inventory_transactions: store select own" on public.inventory_transactions;
create policy "inventory_transactions: store select own"
on public.inventory_transactions for select
to authenticated
using (store_id = current_user_store_id());

drop policy if exists "inventory_balances: admin select all" on public.inventory_balances;
create policy "inventory_balances: admin select all"
on public.inventory_balances for select
to authenticated
using (current_user_role() = 'ADMIN');

drop policy if exists "inventory_balances: store select own" on public.inventory_balances;
create policy "inventory_balances: store select own"
on public.inventory_balances for select
to authenticated
using (store_id = current_user_store_id());

-- The one and only write path for both tables. Row-locks the balance row
-- (`for update`) so two concurrent transactions against the same
-- store+SKU can never race and silently drop one of them -- the second
-- caller simply waits for the first to commit, then reads the up-to-date
-- previous_quantity. Authorization is re-derived from the caller's own
-- session (never trusts a role/store_id passed as an argument): ADMIN may
-- record a transaction for any store, STORE only for their own assigned
-- store, CUSTOMER never.
create or replace function public.record_inventory_transaction(
  p_store_id uuid,
  p_product_sku_id uuid,
  p_transaction_type text,
  p_quantity integer,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reason text default null
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_caller_store uuid;
  v_prev_qty integer;
  v_new_qty integer;
  v_txn public.inventory_transactions;
begin
  select role, store_id into v_role, v_caller_store
  from public.profiles
  where id = auth.uid();

  if v_role is null then
    raise exception 'Not authorized.';
  end if;

  if v_role = 'CUSTOMER' then
    raise exception 'Not authorized.';
  end if;

  if v_role = 'STORE' and (v_caller_store is null or v_caller_store <> p_store_id) then
    raise exception 'Not authorized for this store.';
  end if;

  -- Lock the balance row (if it exists) for the duration of this
  -- transaction so a concurrent call for the same store+SKU blocks here
  -- rather than both readers computing new_quantity from the same stale
  -- previous_quantity.
  select quantity into v_prev_qty
  from public.inventory_balances
  where store_id = p_store_id and product_sku_id = p_product_sku_id
  for update;

  v_prev_qty := coalesce(v_prev_qty, 0);
  v_new_qty := v_prev_qty + p_quantity;

  insert into public.inventory_transactions (
    store_id, product_sku_id, transaction_type, quantity,
    reference_type, reference_id, previous_quantity, new_quantity,
    reason, performed_by
  ) values (
    p_store_id, p_product_sku_id, p_transaction_type, p_quantity,
    p_reference_type, p_reference_id, v_prev_qty, v_new_qty,
    p_reason, auth.uid()
  )
  returning * into v_txn;

  insert into public.inventory_balances (store_id, product_sku_id, quantity, updated_at)
  values (p_store_id, p_product_sku_id, v_new_qty, now())
  on conflict (store_id, product_sku_id)
  do update set quantity = v_new_qty, updated_at = now();

  return v_txn;
end;
$$;
