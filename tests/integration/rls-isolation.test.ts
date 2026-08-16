import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { SupabaseStorageProvider } from "@/lib/providers/supabase-storage";
import { updateClothingItem, deleteClothingItem } from "@/app/dashboard/actions";

describe("RLS isolation between users", () => {
  // clothing-photos is a shared ADMIN-managed catalog bucket as of
  // migration 0007 -- object-path folder ownership no longer gates
  // anything on this bucket. These two tests replace the old
  // per-user-folder isolation tests, which no longer describe real
  // behavior: a non-admin is blocked from uploading at all (any path),
  // and any authenticated user (any role) can read any object in it.
  it("a non-admin (CUSTOMER) cannot upload to the clothing-photos bucket", async () => {
    const customer = await createTestUser("CUSTOMER");
    const provider = new SupabaseStorageProvider(customer.client);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    await expect(
      provider.uploadImage({ userId: customer.id, file: blob, path: `${customer.id}/intrusion.jpg` })
    ).rejects.toThrow();

    await customer.cleanup();
  });

  it("an ADMIN can upload to clothing-photos, and any authenticated role can read it back", async () => {
    const admin = await createTestUser("ADMIN");
    const customer = await createTestUser("CUSTOMER");
    const providerAsAdmin = new SupabaseStorageProvider(admin.client);
    const providerAsCustomer = new SupabaseStorageProvider(customer.client);
    const path = `${admin.id}/catalog-item.jpg`;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    await providerAsAdmin.uploadImage({ userId: admin.id, file: blob, path });

    // Shared catalog: a CUSTOMER's client can mint a signed URL for a
    // photo an ADMIN uploaded -- this is the intended pivot away from
    // per-user-folder isolation for this bucket specifically.
    await expect(providerAsCustomer.getSignedUrl(path)).resolves.toContain("http");

    await providerAsAdmin.deleteImage(path);
    await admin.cleanup();
    await customer.cleanup();
  });

  it("user A cannot write into user B's outfit-images storage folder", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const providerAsA = new SupabaseStorageProvider(userA.client, "outfit-images");
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    await expect(
      providerAsA.uploadImage({ userId: userA.id, file: blob, path: `${userB.id}/intrusion.jpg` })
    ).rejects.toThrow();

    await userA.cleanup();
    await userB.cleanup();
  });

  it("user A cannot read a signed URL for user B's generated outfit image without permission", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const providerAsB = new SupabaseStorageProvider(userB.client, "outfit-images");
    const providerAsA = new SupabaseStorageProvider(userA.client, "outfit-images");
    const path = `${userB.id}/private-look.jpg`;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    await providerAsB.uploadImage({ userId: userB.id, file: blob, path });

    await expect(providerAsA.getSignedUrl(path)).rejects.toThrow();

    await providerAsB.deleteImage(path);
    await userA.cleanup();
    await userB.cleanup();
  });

  it("clothing_items is a shared catalog: any authenticated role can read a row, but only ADMIN can update or delete it", async () => {
    const admin = await createTestUser("ADMIN");
    const customer = await createTestUser("CUSTOMER");
    const dbAdmin = supabaseAdmin();

    const { data: category } = await dbAdmin.from("clothing_categories").select("id").limit(1).single();
    const { data: subcategory } = await dbAdmin
      .from("clothing_subcategories")
      .select("id")
      .eq("category_id", category!.id)
      .limit(1)
      .single();

    const { data: item, error: insertError } = await admin.client
      .from("clothing_items")
      .insert({
        user_id: admin.id,
        image_url: `${admin.id}/item.jpg`,
        category_id: category!.id,
        subcategory_id: subcategory!.id,
        primary_color: "blue",
        pattern: "solid",
        style: "casual",
        formality_level: 2,
        description: "test item",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    // Shared catalog: a CUSTOMER can read an item an ADMIN curated.
    const { data: readAsCustomer } = await customer.client.from("clothing_items").select("id").eq("id", item!.id);
    expect(readAsCustomer).toEqual([{ id: item!.id }]);

    // But a CUSTOMER cannot mutate it, whether through the server action's
    // requireRole gate or (independently) direct RLS.
    const updateResult = await updateClothingItem(
      item!.id,
      {
        categoryId: category!.id,
        subcategoryId: subcategory!.id,
        imagePath: `${admin.id}/item.jpg`,
        primaryColor: "hacked",
        secondaryColors: [],
        pattern: "solid",
        style: "casual",
        formalityLevel: 2,
        description: "hacked",
        userEdited: true,
      },
      customer.client
    );
    expect("error" in updateResult).toBe(true);

    const deleteResult = await deleteClothingItem(item!.id, customer.client);
    expect("error" in deleteResult).toBe(true);

    const { data: directUpdateAsCustomer } = await customer.client
      .from("clothing_items")
      .update({ primary_color: "hacked" })
      .eq("id", item!.id)
      .select();
    expect(directUpdateAsCustomer).toEqual([]);

    const { data: stillThere } = await dbAdmin.from("clothing_items").select("primary_color").eq("id", item!.id).single();
    expect(stillThere?.primary_color).toBe("blue");

    // An ADMIN, on the other hand, can update and delete it.
    const adminUpdateResult = await updateClothingItem(
      item!.id,
      {
        categoryId: category!.id,
        subcategoryId: subcategory!.id,
        imagePath: `${admin.id}/item.jpg`,
        primaryColor: "green",
        secondaryColors: [],
        pattern: "solid",
        style: "casual",
        formalityLevel: 2,
        description: "updated by admin",
        userEdited: true,
      },
      admin.client
    );
    expect("data" in adminUpdateResult).toBe(true);

    const adminDeleteResult = await deleteClothingItem(item!.id, admin.client);
    expect("data" in adminDeleteResult).toBe(true);

    await admin.cleanup();
    await customer.cleanup();
  });

  it("user A cannot read or modify user B's outfits row", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const admin = supabaseAdmin();

    const { data: outfit } = await userB.client
      .from("outfits")
      .insert({ user_id: userB.id, generation_status: "completed", generated_image_url: `${userB.id}/x.jpg` })
      .select("id")
      .single();

    const { data: readAsA } = await userA.client.from("outfits").select("id").eq("id", outfit!.id);
    expect(readAsA).toEqual([]);

    const { data: updateAsA } = await userA.client
      .from("outfits")
      .update({ generation_status: "failed" })
      .eq("id", outfit!.id)
      .select();
    expect(updateAsA).toEqual([]);

    await admin.from("outfits").delete().eq("id", outfit!.id);
    await userA.cleanup();
    await userB.cleanup();
  });

  it("a non-admin cannot insert a clothing_items row (INSERT policy requires ADMIN, not just a matching user_id)", async () => {
    const store = await createTestUser("STORE");
    const dbAdmin = supabaseAdmin();

    const { data: category } = await dbAdmin.from("clothing_categories").select("id").limit(1).single();
    const { data: subcategory } = await dbAdmin
      .from("clothing_subcategories")
      .select("id")
      .eq("category_id", category!.id)
      .limit(1)
      .single();

    const { data: spoofed, error: insertError } = await store.client
      .from("clothing_items")
      .insert({
        user_id: store.id,
        image_url: `${store.id}/spoofed.jpg`,
        category_id: category!.id,
        subcategory_id: subcategory!.id,
        primary_color: "red",
        pattern: "solid",
        style: "casual",
        formality_level: 2,
        description: "spoofed item",
      })
      .select("id");

    expect(insertError).not.toBeNull();
    expect(spoofed).toBeFalsy();

    const { data: leaked } = await dbAdmin.from("clothing_items").select("id").eq("image_url", `${store.id}/spoofed.jpg`);
    expect(leaked).toEqual([]);

    await store.cleanup();
  });

  it("user A cannot insert an outfits row impersonating user B (INSERT policy enforces user_id = auth.uid())", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const admin = supabaseAdmin();

    const { data: spoofed, error: insertError } = await userA.client
      .from("outfits")
      .insert({ user_id: userB.id, generation_status: "completed", generated_image_url: `${userB.id}/spoofed.jpg` })
      .select("id");

    expect(insertError).not.toBeNull();
    expect(spoofed).toBeFalsy();

    const { data: leaked } = await admin
      .from("outfits")
      .select("id")
      .eq("generated_image_url", `${userB.id}/spoofed.jpg`);
    expect(leaked).toEqual([]);

    await userA.cleanup();
    await userB.cleanup();
  });

  it("user A cannot read or insert into user B's outfit_items", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const admin = supabaseAdmin();

    const { data: category } = await admin.from("clothing_categories").select("id").limit(1).single();
    const { data: subcategory } = await admin
      .from("clothing_subcategories")
      .select("id")
      .eq("category_id", category!.id)
      .limit(1)
      .single();

    const { data: itemB } = await admin
      .from("clothing_items")
      .insert({
        user_id: userB.id,
        image_url: `${userB.id}/item.jpg`,
        category_id: category!.id,
        subcategory_id: subcategory!.id,
        primary_color: "blue",
        pattern: "solid",
        style: "casual",
        formality_level: 2,
        description: "B's item",
      })
      .select("id")
      .single();

    const { data: outfitB } = await admin
      .from("outfits")
      .insert({ user_id: userB.id, generation_status: "completed", generated_image_url: `${userB.id}/x.jpg` })
      .select("id")
      .single();

    const { data: outfitItemB } = await admin
      .from("outfit_items")
      .insert({ outfit_id: outfitB!.id, clothing_item_id: itemB!.id, role: "top" })
      .select("id")
      .single();

    const { data: readAsA } = await userA.client
      .from("outfit_items")
      .select("id")
      .eq("outfit_id", outfitB!.id);
    expect(readAsA).toEqual([]);

    const { data: insertedAsA, error: insertError } = await userA.client
      .from("outfit_items")
      .insert({ outfit_id: outfitB!.id, clothing_item_id: itemB!.id, role: "bottom" })
      .select("id");
    expect(insertError).not.toBeNull();
    expect(insertedAsA).toBeFalsy();

    await admin.from("outfit_items").delete().eq("id", outfitItemB!.id);
    await admin.from("outfits").delete().eq("id", outfitB!.id);
    await admin.from("clothing_items").delete().eq("id", itemB!.id);
    await userA.cleanup();
    await userB.cleanup();
  });

  it("any authenticated role can get outfit recommendations from the shared catalog (no wardrobe ownership boundary anymore)", async () => {
    const admin = await createTestUser("ADMIN");
    const customer = await createTestUser("CUSTOMER");
    const dbAdmin = supabaseAdmin();

    const { data: category } = await dbAdmin.from("clothing_categories").select("id").eq("name", "top").single();
    const { data: subcategory } = await dbAdmin
      .from("clothing_subcategories")
      .select("id")
      .eq("category_id", category!.id)
      .limit(1)
      .single();
    const { data: item } = await dbAdmin
      .from("clothing_items")
      .insert({
        user_id: admin.id,
        image_url: `${admin.id}/shirt.jpg`,
        category_id: category!.id,
        subcategory_id: subcategory!.id,
        primary_color: "white",
        pattern: "solid",
        style: "business_formal",
        formality_level: 4,
        description: "white shirt",
      })
      .select("id")
      .single();

    // This is the intended pivot: a CUSTOMER (who owns nothing in the
    // catalog) can still get recommendations for an ADMIN-curated item,
    // because clothing_items visibility is no longer ownership-scoped.
    const { findMatchingOutfits } = await import("@/app/dashboard/matching-actions");
    const result = await findMatchingOutfits(item!.id, customer.client);
    expect("data" in result).toBe(true);

    await dbAdmin.from("clothing_items").delete().eq("id", item!.id);
    await admin.cleanup();
    await customer.cleanup();
  });
});
