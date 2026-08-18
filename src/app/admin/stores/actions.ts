"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { storeInputSchema, type StoreInput } from "@/lib/validation/inventory";
import type { Store } from "@/lib/inventory/types";

type ActionResult<T> = { data: T } | { error: string };

const NOT_AUTHORIZED: ActionResult<never> = { error: "Not authorized." };

interface StoreRow {
  id: string;
  store_code: string;
  store_name: string;
  region: string | null;
  city: string | null;
  address: string | null;
  status: "active" | "inactive";
  manager_name: string | null;
  manager_email: string | null;
  created_at: string;
  updated_at: string;
}

function toStore(row: StoreRow): Store {
  return {
    id: row.id,
    storeCode: row.store_code,
    storeName: row.store_name,
    region: row.region,
    city: row.city,
    address: row.address,
    status: row.status,
    managerName: row.manager_name,
    managerEmail: row.manager_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createStore(
  input: StoreInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<Store>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) return NOT_AUTHORIZED;

  const parsed = storeInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some store details are missing or invalid." };

  const { data, error } = await supabase
    .from("stores")
    .insert({
      store_code: parsed.data.storeCode,
      store_name: parsed.data.storeName,
      region: parsed.data.region ?? null,
      city: parsed.data.city ?? null,
      address: parsed.data.address ?? null,
      status: parsed.data.status,
      manager_name: parsed.data.managerName ?? null,
      manager_email: parsed.data.managerEmail ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Unique violation on store_code is the one realistic, user-facing
    // failure here -- everything else collapses to a generic message
    // rather than leaking a raw Postgres error to the client.
    if (error?.code === "23505") return { error: "A store with that store code already exists." };
    return { error: "Couldn't create the store — please try again." };
  }

  return { data: toStore(data as StoreRow) };
}

export async function updateStore(
  storeId: string,
  input: StoreInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<Store>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) return NOT_AUTHORIZED;

  const parsed = storeInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some store details are missing or invalid." };

  const { data, error } = await supabase
    .from("stores")
    .update({
      store_code: parsed.data.storeCode,
      store_name: parsed.data.storeName,
      region: parsed.data.region ?? null,
      city: parsed.data.city ?? null,
      address: parsed.data.address ?? null,
      status: parsed.data.status,
      manager_name: parsed.data.managerName ?? null,
      manager_email: parsed.data.managerEmail ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storeId)
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") return { error: "A store with that store code already exists." };
    return { error: "Couldn't update the store — please try again." };
  }

  return { data: toStore(data as StoreRow) };
}

export async function listStores(injectedClient?: SupabaseClient): Promise<ActionResult<Store[]>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) return NOT_AUTHORIZED;

  const { data, error } = await supabase.from("stores").select("*").order("store_name");
  if (error || !data) return { error: "Couldn't load stores — please try again." };

  return { data: (data as StoreRow[]).map(toStore) };
}

// Assigns an existing user (by id) to a store and promotes their role to
// STORE. The target's store_id is never something the target user (or any
// non-admin caller) can set themselves -- this is the only write path,
// gated by requireRole(["ADMIN"]) and the profiles-admin-update RLS
// policy (migration 0016) underneath it. Deliberately takes a userId
// rather than an email/lookup -- Phase 2's admin UI will resolve a picked
// user to an id before calling this.
export async function assignStoreUser(
  userId: string,
  storeId: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ userId: string; storeId: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) return NOT_AUTHORIZED;

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .single();
  if (storeError || !store) return { error: "That store could not be found." };

  const { error } = await supabase
    .from("profiles")
    .update({ role: "STORE", store_id: storeId })
    .eq("id", userId);

  if (error) return { error: "Couldn't assign this user to the store — please try again." };

  return { data: { userId, storeId } };
}
