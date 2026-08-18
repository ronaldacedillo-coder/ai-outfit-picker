import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { createStore, listStores, updateStore } from "@/app/admin/stores/actions";

function uniqueStoreCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

describe("stores admin actions", () => {
  it("lets an ADMIN create, list, and update a store", async () => {
    const adminUser = await createTestUser("ADMIN");
    const storeCode = uniqueStoreCode("TST");

    try {
      const createResult = await createStore(
        { storeCode, storeName: "Test Store Manila", region: "NCR", city: "Manila", status: "active" },
        adminUser.client
      );
      if ("error" in createResult) throw new Error(createResult.error);
      expect(createResult.data.storeCode).toBe(storeCode);
      expect(createResult.data.status).toBe("active");

      const listResult = await listStores(adminUser.client);
      if ("error" in listResult) throw new Error(listResult.error);
      expect(listResult.data.some((s) => s.id === createResult.data.id)).toBe(true);

      const updateResult = await updateStore(
        createResult.data.id,
        { storeCode, storeName: "Test Store Manila (Updated)", status: "inactive" },
        adminUser.client
      );
      if ("error" in updateResult) throw new Error(updateResult.error);
      expect(updateResult.data.storeName).toBe("Test Store Manila (Updated)");
      expect(updateResult.data.status).toBe("inactive");

      const admin = supabaseAdmin();
      await admin.from("stores").delete().eq("id", createResult.data.id);
    } finally {
      await adminUser.cleanup();
    }
  });

  it("rejects a duplicate store_code with a friendly error, not a raw Postgres error", async () => {
    const adminUser = await createTestUser("ADMIN");
    const storeCode = uniqueStoreCode("DUP");

    try {
      const first = await createStore({ storeCode, storeName: "First", status: "active" }, adminUser.client);
      if ("error" in first) throw new Error(first.error);

      const second = await createStore({ storeCode, storeName: "Second", status: "active" }, adminUser.client);
      expect("error" in second).toBe(true);
      if ("error" in second) expect(second.error).toContain("already exists");

      const admin = supabaseAdmin();
      await admin.from("stores").delete().eq("id", first.data.id);
    } finally {
      await adminUser.cleanup();
    }
  });

  it("rejects create/list/update from a non-admin (STORE)", async () => {
    const storeUser = await createTestUser("STORE");
    try {
      const createResult = await createStore(
        { storeCode: uniqueStoreCode("NOPE"), storeName: "Should not be created", status: "active" },
        storeUser.client
      );
      expect("error" in createResult).toBe(true);

      const listResult = await listStores(storeUser.client);
      expect("error" in listResult).toBe(true);
    } finally {
      await storeUser.cleanup();
    }
  });

  it("lets a STORE user read only their own assigned store, not others (RLS)", async () => {
    const admin = supabaseAdmin();
    const { data: storeA } = await admin
      .from("stores")
      .insert({ store_code: uniqueStoreCode("A"), store_name: "Store A" })
      .select("id")
      .single();
    const { data: storeB } = await admin
      .from("stores")
      .insert({ store_code: uniqueStoreCode("B"), store_name: "Store B" })
      .select("id")
      .single();
    const storeUser = await createTestUser("STORE");

    try {
      await admin.from("profiles").update({ store_id: storeA!.id }).eq("id", storeUser.id);

      const { data: visibleStores } = await storeUser.client.from("stores").select("id");
      const visibleIds = (visibleStores ?? []).map((s) => s.id);
      expect(visibleIds).toContain(storeA!.id);
      expect(visibleIds).not.toContain(storeB!.id);
    } finally {
      await storeUser.cleanup();
      await admin.from("stores").delete().in("id", [storeA!.id, storeB!.id]);
    }
  });

  it("gives a CUSTOMER no visibility into any store", async () => {
    const admin = supabaseAdmin();
    const { data: store } = await admin
      .from("stores")
      .insert({ store_code: uniqueStoreCode("C"), store_name: "Customer-invisible store" })
      .select("id")
      .single();
    const customerUser = await createTestUser("CUSTOMER");

    try {
      const { data: visibleStores } = await customerUser.client.from("stores").select("id");
      expect(visibleStores ?? []).toEqual([]);
    } finally {
      await customerUser.cleanup();
      await admin.from("stores").delete().eq("id", store!.id);
    }
  });
});
