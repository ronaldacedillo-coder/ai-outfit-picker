"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  productSkuInputSchema,
  recordInventoryTransactionInputSchema,
  type ProductSkuInput,
  type RecordInventoryTransactionInput,
} from "@/lib/validation/inventory";
import type { InventoryBalance, InventoryTransaction, ProductSku } from "@/lib/inventory/types";

type ActionResult<T> = { data: T } | { error: string };

const NOT_AUTHORIZED: ActionResult<never> = { error: "Not authorized." };

interface ProductSkuRow {
  id: string;
  clothing_item_id: string;
  sku: string;
  size: string | null;
  style: string | null;
  fit: string | null;
  waist_size: string | null;
  length: string | null;
  attributes: Record<string, unknown>;
  status: "active" | "discontinued";
  created_at: string;
  updated_at: string;
}

function toProductSku(row: ProductSkuRow): ProductSku {
  return {
    id: row.id,
    clothingItemId: row.clothing_item_id,
    sku: row.sku,
    size: row.size,
    style: row.style,
    fit: row.fit,
    waistSize: row.waist_size,
    length: row.length,
    attributes: row.attributes ?? {},
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ADMIN-only, same shape as clothing_items catalog CRUD elsewhere in this
// app -- product_skus is still catalog data (Part 4/5), just a finer-
// grained variant layer under a clothing_items "parent product".
export async function createProductSku(
  input: ProductSkuInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<ProductSku>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) return NOT_AUTHORIZED;

  const parsed = productSkuInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some SKU details are missing or invalid." };

  const { data: parentItem, error: parentError } = await supabase
    .from("clothing_items")
    .select("id")
    .eq("id", parsed.data.clothingItemId)
    .single();
  if (parentError || !parentItem) return { error: "That catalog product could not be found." };

  const { data, error } = await supabase
    .from("product_skus")
    .insert({
      clothing_item_id: parsed.data.clothingItemId,
      sku: parsed.data.sku,
      size: parsed.data.size ?? null,
      style: parsed.data.style ?? null,
      fit: parsed.data.fit ?? null,
      waist_size: parsed.data.waistSize ?? null,
      length: parsed.data.length ?? null,
      attributes: parsed.data.attributes,
      status: parsed.data.status,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") return { error: "A SKU with that item code already exists." };
    return { error: "Couldn't create the SKU — please try again." };
  }

  return { data: toProductSku(data as ProductSkuRow) };
}

interface InventoryTransactionRow {
  id: string;
  store_id: string;
  product_sku_id: string;
  transaction_type: InventoryTransaction["transactionType"];
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  previous_quantity: number;
  new_quantity: number;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
}

function toInventoryTransaction(row: InventoryTransactionRow): InventoryTransaction {
  return {
    id: row.id,
    storeId: row.store_id,
    productSkuId: row.product_sku_id,
    transactionType: row.transaction_type,
    quantity: row.quantity,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    previousQuantity: row.previous_quantity,
    newQuantity: row.new_quantity,
    reason: row.reason,
    performedBy: row.performed_by,
    createdAt: row.created_at,
  };
}

// The only write path into inventory_transactions/inventory_balances --
// thin wrapper around record_inventory_transaction() (migration 0019),
// which does its own authorization re-derivation and row-locked balance
// update. This action's requireRole check exists to fail fast with a
// friendly message before ever reaching the database; the RPC's own check
// is the real, unbypassable boundary (matches the existing pattern of
// requireRole as defense-in-depth alongside RLS, not a replacement for it).
export async function recordInventoryTransaction(
  input: RecordInventoryTransactionInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<InventoryTransaction>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN", "STORE"]);
  if (!auth) return NOT_AUTHORIZED;

  const parsed = recordInventoryTransactionInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some transaction details are missing or invalid." };

  if (auth.role === "STORE" && auth.storeId !== parsed.data.storeId) {
    return { error: "Not authorized for this store." };
  }

  const { data, error } = await supabase.rpc("record_inventory_transaction", {
    p_store_id: parsed.data.storeId,
    p_product_sku_id: parsed.data.productSkuId,
    p_transaction_type: parsed.data.transactionType,
    p_quantity: parsed.data.quantity,
    p_reference_type: parsed.data.referenceType ?? null,
    p_reference_id: parsed.data.referenceId ?? null,
    p_reason: parsed.data.reason ?? null,
  });

  if (error || !data) return { error: "Couldn't record this inventory movement — please try again." };

  return { data: toInventoryTransaction(data as InventoryTransactionRow) };
}

interface InventoryBalanceRow {
  id: string;
  store_id: string;
  product_sku_id: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  minimum_stock: number | null;
  target_stock: number | null;
  reorder_point: number | null;
  updated_at: string;
}

function toInventoryBalance(row: InventoryBalanceRow): InventoryBalance {
  return {
    id: row.id,
    storeId: row.store_id,
    productSkuId: row.product_sku_id,
    quantity: row.quantity,
    reservedQuantity: row.reserved_quantity,
    availableQuantity: row.available_quantity,
    minimumStock: row.minimum_stock,
    targetStock: row.target_stock,
    reorderPoint: row.reorder_point,
    updatedAt: row.updated_at,
  };
}

// STORE callers always see only their own store's balances -- storeId is
// ignored for them (their own auth.storeId is used instead), never
// trusted from the argument, matching the "never trust a client-sent
// store_id" requirement. ADMIN may pass a specific storeId, or omit it to
// see every store's balances (RLS on inventory_balances would enforce
// this regardless, this is just the friendlier, intentional query shape).
export async function getInventoryBalances(
  storeId: string | undefined,
  injectedClient?: SupabaseClient
): Promise<ActionResult<InventoryBalance[]>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN", "STORE"]);
  if (!auth) return NOT_AUTHORIZED;

  let query = supabase.from("inventory_balances").select("*");

  if (auth.role === "STORE") {
    if (!auth.storeId) return { data: [] };
    query = query.eq("store_id", auth.storeId);
  } else if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;
  if (error || !data) return { error: "Couldn't load inventory — please try again." };

  return { data: (data as InventoryBalanceRow[]).map(toInventoryBalance) };
}
