import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { createProductSku } from "@/app/inventory/actions";

async function seedCatalogItem(adminId: string) {
  const admin = supabaseAdmin();
  const { data: category } = await admin.from("clothing_categories").select("id").eq("name", "bottom").single();
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
      image_url: `${adminId}/trouser.jpg`,
      category_id: category!.id,
      subcategory_id: subcategory!.id,
      primary_color: "navy",
      pattern: "solid",
      style: "business_formal",
      formality_level: 4,
      description: "Navy tailored trouser",
    })
    .select("id")
    .single();
  return item!.id as string;
}

function uniqueSku(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

describe("product_skus admin actions", () => {
  it("lets an ADMIN create a pants SKU using the style+fit+waist_size dimensions", async () => {
    const adminUser = await createTestUser("ADMIN");
    const clothingItemId = await seedCatalogItem(adminUser.id);
    const sku = uniqueSku("ARW-TRS");

    try {
      const result = await createProductSku(
        { clothingItemId, sku, style: "Slim Fit", fit: "Tapered", waistSize: "32", attributes: {}, status: "active" },
        adminUser.client
      );
      if ("error" in result) throw new Error(result.error);
      expect(result.data.sku).toBe(sku);
      expect(result.data.style).toBe("Slim Fit");
      expect(result.data.fit).toBe("Tapered");
      expect(result.data.waistSize).toBe("32");
      expect(result.data.size).toBeNull();

      const admin = supabaseAdmin();
      await admin.from("product_skus").delete().eq("id", result.data.id);
      await admin.from("clothing_items").delete().eq("id", clothingItemId);
    } finally {
      await adminUser.cleanup();
    }
  });

  it("lets a shirt/jacket SKU use the plain size dimension instead", async () => {
    const adminUser = await createTestUser("ADMIN");
    const clothingItemId = await seedCatalogItem(adminUser.id);
    const sku = uniqueSku("ARW-JKT");

    try {
      const result = await createProductSku(
        { clothingItemId, sku, size: "M", attributes: {}, status: "active" },
        adminUser.client
      );
      if ("error" in result) throw new Error(result.error);
      expect(result.data.size).toBe("M");
      expect(result.data.style).toBeNull();
      expect(result.data.waistSize).toBeNull();

      const admin = supabaseAdmin();
      await admin.from("product_skus").delete().eq("id", result.data.id);
      await admin.from("clothing_items").delete().eq("id", clothingItemId);
    } finally {
      await adminUser.cleanup();
    }
  });

  it("rejects SKU creation from a non-admin (STORE)", async () => {
    const adminUser = await createTestUser("ADMIN");
    const storeUser = await createTestUser("STORE");
    const clothingItemId = await seedCatalogItem(adminUser.id);

    try {
      const result = await createProductSku(
        { clothingItemId, sku: uniqueSku("ARW-DENY"), size: "L", attributes: {}, status: "active" },
        storeUser.client
      );
      expect("error" in result).toBe(true);
    } finally {
      await adminUser.cleanup();
      await storeUser.cleanup();
      const admin = supabaseAdmin();
      await admin.from("clothing_items").delete().eq("id", clothingItemId);
    }
  });

  it("lets any authenticated role (including CUSTOMER) SELECT product_skus, matching the shared-catalog read model", async () => {
    const adminUser = await createTestUser("ADMIN");
    const customerUser = await createTestUser("CUSTOMER");
    const clothingItemId = await seedCatalogItem(adminUser.id);
    const sku = uniqueSku("ARW-READ");

    try {
      const created = await createProductSku(
        { clothingItemId, sku, size: "S", attributes: {}, status: "active" },
        adminUser.client
      );
      if ("error" in created) throw new Error(created.error);

      const { data: visible } = await customerUser.client.from("product_skus").select("id").eq("sku", sku);
      expect(visible?.length).toBe(1);

      const admin = supabaseAdmin();
      await admin.from("product_skus").delete().eq("id", created.data.id);
      await admin.from("clothing_items").delete().eq("id", clothingItemId);
    } finally {
      await adminUser.cleanup();
      await customerUser.cleanup();
    }
  });
});
