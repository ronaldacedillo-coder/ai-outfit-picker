import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { recordInventoryTransaction, getInventoryBalances } from "@/app/inventory/actions";

function uniqueCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function seedStoreAndSku(adminId: string) {
  const admin = supabaseAdmin();
  const { data: store } = await admin
    .from("stores")
    .insert({ store_code: uniqueCode("LEDGER"), store_name: "Ledger Test Store" })
    .select("id")
    .single();

  const { data: category } = await admin.from("clothing_categories").select("id").eq("name", "top").single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", category!.id)
    .limit(1)
    .single();
  const { data: item } = await admin
    .from("clothing_items")
    .insert({
      user_id: adminId,
      image_url: `${adminId}/ledger-shirt.jpg`,
      category_id: category!.id,
      subcategory_id: subcategory!.id,
      primary_color: "white",
      pattern: "solid",
      style: "business_formal",
      formality_level: 4,
      description: "White business shirt",
    })
    .select("id")
    .single();

  const { data: sku } = await admin
    .from("product_skus")
    .insert({ clothing_item_id: item!.id, sku: uniqueCode("ARW-LEDGER"), size: "M" })
    .select("id")
    .single();

  return { storeId: store!.id as string, clothingItemId: item!.id as string, skuId: sku!.id as string };
}

async function cleanup(storeId: string, clothingItemId: string, skuId: string) {
  const admin = supabaseAdmin();
  await admin.from("inventory_transactions").delete().eq("store_id", storeId);
  await admin.from("inventory_balances").delete().eq("store_id", storeId);
  await admin.from("product_skus").delete().eq("id", skuId);
  await admin.from("clothing_items").delete().eq("id", clothingItemId);
  await admin.from("stores").delete().eq("id", storeId);
}

describe("inventory ledger + balance mechanics", () => {
  it("creates a correct opening balance, then correctly accumulates a sale and a receipt", async () => {
    const adminUser = await createTestUser("ADMIN");
    const { storeId, clothingItemId, skuId } = await seedStoreAndSku(adminUser.id);

    try {
      const opening = await recordInventoryTransaction(
        { storeId, productSkuId: skuId, transactionType: "opening_balance", quantity: 100 },
        adminUser.client
      );
      if ("error" in opening) throw new Error(opening.error);
      expect(opening.data.previousQuantity).toBe(0);
      expect(opening.data.newQuantity).toBe(100);

      const sale = await recordInventoryTransaction(
        { storeId, productSkuId: skuId, transactionType: "sale", quantity: -5, reason: "counter sale" },
        adminUser.client
      );
      if ("error" in sale) throw new Error(sale.error);
      expect(sale.data.previousQuantity).toBe(100);
      expect(sale.data.newQuantity).toBe(95);

      const receipt = await recordInventoryTransaction(
        { storeId, productSkuId: skuId, transactionType: "purchase_receipt", quantity: 20 },
        adminUser.client
      );
      if ("error" in receipt) throw new Error(receipt.error);
      expect(receipt.data.newQuantity).toBe(115);

      const balances = await getInventoryBalances(storeId, adminUser.client);
      if ("error" in balances) throw new Error(balances.error);
      const balance = balances.data.find((b) => b.productSkuId === skuId);
      expect(balance?.quantity).toBe(115);
      expect(balance?.availableQuantity).toBe(115);

      const admin = supabaseAdmin();
      const { data: txns } = await admin
        .from("inventory_transactions")
        .select("id")
        .eq("store_id", storeId)
        .eq("product_sku_id", skuId);
      expect(txns?.length).toBe(3);
    } finally {
      await adminUser.cleanup();
      await cleanup(storeId, clothingItemId, skuId);
    }
  });

  it("rejects a zero quantity", async () => {
    const adminUser = await createTestUser("ADMIN");
    const { storeId, clothingItemId, skuId } = await seedStoreAndSku(adminUser.id);

    try {
      const result = await recordInventoryTransaction(
        { storeId, productSkuId: skuId, transactionType: "adjustment_in", quantity: 0 },
        adminUser.client
      );
      expect("error" in result).toBe(true);
    } finally {
      await adminUser.cleanup();
      await cleanup(storeId, clothingItemId, skuId);
    }
  });

  it("lets a STORE user record a transaction for their own store, but rejects one for a different store", async () => {
    const adminUser = await createTestUser("ADMIN");
    const { storeId: ownStoreId, clothingItemId, skuId } = await seedStoreAndSku(adminUser.id);
    const admin = supabaseAdmin();
    const { data: otherStore } = await admin
      .from("stores")
      .insert({ store_code: uniqueCode("OTHER"), store_name: "Other Store" })
      .select("id")
      .single();
    const storeUser = await createTestUser("STORE");

    try {
      await admin.from("profiles").update({ store_id: ownStoreId }).eq("id", storeUser.id);

      const ownResult = await recordInventoryTransaction(
        { storeId: ownStoreId, productSkuId: skuId, transactionType: "opening_balance", quantity: 10 },
        storeUser.client
      );
      if ("error" in ownResult) throw new Error(ownResult.error);
      expect(ownResult.data.newQuantity).toBe(10);

      const otherResult = await recordInventoryTransaction(
        { storeId: otherStore!.id, productSkuId: skuId, transactionType: "opening_balance", quantity: 10 },
        storeUser.client
      );
      expect("error" in otherResult).toBe(true);
    } finally {
      await storeUser.cleanup();
      await adminUser.cleanup();
      await cleanup(ownStoreId, clothingItemId, skuId);
      await admin.from("stores").delete().eq("id", otherStore!.id);
    }
  });

  it("rejects a CUSTOMER from recording any inventory transaction", async () => {
    const adminUser = await createTestUser("ADMIN");
    const { storeId, clothingItemId, skuId } = await seedStoreAndSku(adminUser.id);
    const customerUser = await createTestUser("CUSTOMER");

    try {
      const result = await recordInventoryTransaction(
        { storeId, productSkuId: skuId, transactionType: "opening_balance", quantity: 10 },
        customerUser.client
      );
      expect("error" in result).toBe(true);
    } finally {
      await customerUser.cleanup();
      await adminUser.cleanup();
      await cleanup(storeId, clothingItemId, skuId);
    }
  });

  it("keeps one store's inventory invisible to a STORE user assigned to a different store (RLS)", async () => {
    const adminUser = await createTestUser("ADMIN");
    const { storeId, clothingItemId, skuId } = await seedStoreAndSku(adminUser.id);
    const admin = supabaseAdmin();
    const { data: otherStore } = await admin
      .from("stores")
      .insert({ store_code: uniqueCode("BLIND"), store_name: "Blind Store" })
      .select("id")
      .single();
    const otherStoreUser = await createTestUser("STORE");

    try {
      await recordInventoryTransaction(
        { storeId, productSkuId: skuId, transactionType: "opening_balance", quantity: 50 },
        adminUser.client
      );
      await admin.from("profiles").update({ store_id: otherStore!.id }).eq("id", otherStoreUser.id);

      const result = await getInventoryBalances(storeId, otherStoreUser.client);
      if ("error" in result) throw new Error(result.error);
      // storeId argument is ignored for STORE callers -- their own
      // auth.storeId is always used instead, so this must come back empty
      // rather than leaking the other store's balance.
      expect(result.data).toEqual([]);
    } finally {
      await otherStoreUser.cleanup();
      await adminUser.cleanup();
      await cleanup(storeId, clothingItemId, skuId);
      await admin.from("stores").delete().eq("id", otherStore!.id);
    }
  });
});
