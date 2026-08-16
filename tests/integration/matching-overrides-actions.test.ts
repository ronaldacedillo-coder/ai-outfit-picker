import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { createMatchingOverride, deleteMatchingOverride, listMatchingOverrides } from "@/app/admin/matching-overrides/actions";

async function seedCatalogItem(adminId: string, categoryName: string, color: string, suffix: string) {
  const admin = supabaseAdmin();
  const { data: category } = await admin.from("clothing_categories").select("id").eq("name", categoryName).single();
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
      image_url: `${adminId}/${categoryName}-${suffix}.jpg`,
      category_id: category!.id,
      subcategory_id: subcategory!.id,
      primary_color: color,
      pattern: "solid",
      style: "business_formal",
      formality_level: 4,
      description: `${color} ${categoryName}`,
    })
    .select("id")
    .single();
  return item!.id as string;
}

describe("matching-overrides admin actions", () => {
  it("lets an ADMIN create, list, and delete a matching override rule", async () => {
    const adminUser = await createTestUser("ADMIN");
    const baseId = await seedCatalogItem(adminUser.id, "outerwear", "navy", "a");
    const matchedId = await seedCatalogItem(adminUser.id, "bottom", "charcoal", "a");

    const createResult = await createMatchingOverride(
      { baseItemId: baseId, matchedItemId: matchedId, reciprocal: false, priority: 0 },
      adminUser.client
    );
    if ("error" in createResult) throw new Error(createResult.error);

    const listResult = await listMatchingOverrides(adminUser.client);
    if ("error" in listResult) throw new Error(listResult.error);
    expect(listResult.data.rules.some((r) => r.id === createResult.data.id)).toBe(true);

    const deleteResult = await deleteMatchingOverride(createResult.data.id, adminUser.client);
    expect("data" in deleteResult).toBe(true);

    const admin = supabaseAdmin();
    await admin.from("clothing_items").delete().in("id", [baseId, matchedId]);
    await adminUser.cleanup();
  });

  it("rejects create/list/delete from a non-admin (STORE) with Not authorized", async () => {
    const adminUser = await createTestUser("ADMIN");
    const storeUser = await createTestUser("STORE");
    const baseId = await seedCatalogItem(adminUser.id, "outerwear", "black", "b");
    const matchedId = await seedCatalogItem(adminUser.id, "bottom", "gray", "b");

    const createResult = await createMatchingOverride(
      { baseItemId: baseId, matchedItemId: matchedId, reciprocal: false, priority: 0 },
      storeUser.client
    );
    expect(createResult).toEqual({ error: "Not authorized." });

    const listResult = await listMatchingOverrides(storeUser.client);
    expect(listResult).toEqual({ error: "Not authorized." });

    const deleteResult = await deleteMatchingOverride("00000000-0000-0000-0000-000000000000", storeUser.client);
    expect(deleteResult).toEqual({ error: "Not authorized." });

    const admin = supabaseAdmin();
    await admin.from("clothing_items").delete().in("id", [baseId, matchedId]);
    await adminUser.cleanup();
    await storeUser.cleanup();
  });

  it("blocks direct table SELECT for a non-admin, but the get_applicable_overrides RPC still works for them", async () => {
    const adminUser = await createTestUser("ADMIN");
    const customerUser = await createTestUser("CUSTOMER");
    const baseId = await seedCatalogItem(adminUser.id, "outerwear", "brown", "c");
    const matchedId = await seedCatalogItem(adminUser.id, "bottom", "khaki", "c");

    const createResult = await createMatchingOverride(
      { baseItemId: baseId, matchedItemId: matchedId, reciprocal: false, priority: 0 },
      adminUser.client
    );
    if ("error" in createResult) throw new Error(createResult.error);

    // Rule authorship stays admin-only -- a CUSTOMER's client cannot read
    // the raw table directly.
    const { data: directSelect } = await customerUser.client.from("matching_overrides").select("id");
    expect(directSelect).toEqual([]);

    // But the security-definer RPC still resolves applicable rules for them.
    const admin = supabaseAdmin();
    const { data: itemMeta } = await admin
      .from("clothing_items")
      .select("category_id, subcategory_id")
      .eq("id", baseId)
      .single();
    const { data: rpcResult, error: rpcError } = await customerUser.client.rpc("get_applicable_overrides", {
      p_item_id: baseId,
      p_category_id: itemMeta!.category_id,
      p_subcategory_id: itemMeta!.subcategory_id,
      p_occasion: null,
      p_style_context: null,
    });
    expect(rpcError).toBeNull();
    expect(rpcResult.some((r: { id: string }) => r.id === createResult.data.id)).toBe(true);

    await admin.from("matching_overrides").delete().eq("id", createResult.data.id);
    await admin.from("clothing_items").delete().in("id", [baseId, matchedId]);
    await adminUser.cleanup();
    await customerUser.cleanup();
  });
});
