import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { assignStoreUser } from "@/app/admin/stores/actions";

function uniqueStoreCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

describe("store-user association", () => {
  it("lets an ADMIN assign an existing user to a store, promoting them to STORE", async () => {
    const admin = supabaseAdmin();
    const adminUser = await createTestUser("ADMIN");
    const targetUser = await createTestUser("CUSTOMER");
    const { data: store } = await admin
      .from("stores")
      .insert({ store_code: uniqueStoreCode("ASSIGN"), store_name: "Assignment Test Store" })
      .select("id")
      .single();

    try {
      const result = await assignStoreUser(targetUser.id, store!.id, adminUser.client);
      if ("error" in result) throw new Error(result.error);

      const { data: profile } = await admin
        .from("profiles")
        .select("role, store_id")
        .eq("id", targetUser.id)
        .single();
      expect(profile!.role).toBe("STORE");
      expect(profile!.store_id).toBe(store!.id);
    } finally {
      await adminUser.cleanup();
      await targetUser.cleanup();
      await admin.from("stores").delete().eq("id", store!.id);
    }
  });

  it("rejects assignStoreUser from a non-admin caller", async () => {
    const admin = supabaseAdmin();
    const storeUser = await createTestUser("STORE");
    const targetUser = await createTestUser("CUSTOMER");
    const { data: store } = await admin
      .from("stores")
      .insert({ store_code: uniqueStoreCode("REJECT"), store_name: "Reject Assignment Store" })
      .select("id")
      .single();

    try {
      const result = await assignStoreUser(targetUser.id, store!.id, storeUser.client);
      expect("error" in result).toBe(true);

      const { data: profile } = await admin.from("profiles").select("store_id").eq("id", targetUser.id).single();
      expect(profile!.store_id).toBeNull();
    } finally {
      await storeUser.cleanup();
      await targetUser.cleanup();
      await admin.from("stores").delete().eq("id", store!.id);
    }
  });

  // The core "never trust a client-sent store_id" requirement (Part 7):
  // even a raw table UPDATE from the STORE user's own authenticated
  // session -- bypassing the assignStoreUser action entirely -- must be
  // blocked by RLS, since profiles has no self-UPDATE policy at all
  // (migration 0016 only grants UPDATE to ADMIN).
  it("blocks a STORE user from setting their own store_id via a direct table update", async () => {
    const admin = supabaseAdmin();
    const storeUser = await createTestUser("STORE");
    const { data: store } = await admin
      .from("stores")
      .insert({ store_code: uniqueStoreCode("SELFSET"), store_name: "Self-Set Attempt Store" })
      .select("id")
      .single();

    try {
      const { error } = await storeUser.client.from("profiles").update({ store_id: store!.id }).eq("id", storeUser.id);
      // RLS silently filters the update to zero affected rows rather than
      // raising -- the meaningful assertion is that the write never lands.
      expect(error).toBeNull();

      const { data: profile } = await admin.from("profiles").select("store_id").eq("id", storeUser.id).single();
      expect(profile!.store_id).toBeNull();
    } finally {
      await storeUser.cleanup();
      await admin.from("stores").delete().eq("id", store!.id);
    }
  });
});
