import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { SupabaseStorageProvider } from "@/lib/providers/supabase-storage";
import { updateClothingItem, deleteClothingItem } from "@/app/dashboard/actions";

describe("RLS isolation between users", () => {
  it("user A cannot write into user B's storage folder", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const providerAsA = new SupabaseStorageProvider(userA.client);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    await expect(
      providerAsA.uploadImage({ userId: userA.id, file: blob, path: `${userB.id}/intrusion.jpg` })
    ).rejects.toThrow();

    await userA.cleanup();
    await userB.cleanup();
  });

  it("user A cannot read a signed URL for user B's photo without permission", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const providerAsB = new SupabaseStorageProvider(userB.client);
    const providerAsA = new SupabaseStorageProvider(userA.client);
    const path = `${userB.id}/private.jpg`;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    await providerAsB.uploadImage({ userId: userB.id, file: blob, path });

    // createSignedUrl itself is RLS-gated on the SELECT policy -- user A's
    // client cannot mint a signed URL for an object outside their folder.
    await expect(providerAsA.getSignedUrl(path)).rejects.toThrow();

    await providerAsB.deleteImage(path);
    await userA.cleanup();
    await userB.cleanup();
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

  it("user A cannot read, update, or delete user B's clothing_items row", async () => {
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

    const { data: item, error: insertError } = await userB.client
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
        description: "test item",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { data: readAsA } = await userA.client.from("clothing_items").select("id").eq("id", item!.id);
    expect(readAsA).toEqual([]);

    const updateResult = await updateClothingItem(
      item!.id,
      {
        categoryId: category!.id,
        subcategoryId: subcategory!.id,
        imagePath: `${userB.id}/item.jpg`,
        primaryColor: "hacked",
        secondaryColors: [],
        pattern: "solid",
        style: "casual",
        formalityLevel: 2,
        description: "hacked",
        userEdited: true,
      },
      userA.client
    );
    expect("error" in updateResult).toBe(true);

    const deleteResult = await deleteClothingItem(item!.id, userA.client);
    expect("error" in deleteResult).toBe(true);

    const { data: stillThere } = await admin.from("clothing_items").select("id").eq("id", item!.id);
    expect(stillThere).toHaveLength(1);

    await admin.from("clothing_items").delete().eq("id", item!.id);
    await userA.cleanup();
    await userB.cleanup();
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

  it("user A cannot insert a clothing_items row impersonating user B (INSERT policy enforces user_id = auth.uid())", async () => {
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

    const { data: spoofed, error: insertError } = await userA.client
      .from("clothing_items")
      .insert({
        user_id: userB.id,
        image_url: `${userB.id}/spoofed.jpg`,
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

    const { data: leaked } = await admin.from("clothing_items").select("id").eq("image_url", `${userB.id}/spoofed.jpg`);
    expect(leaked).toEqual([]);

    await userA.cleanup();
    await userB.cleanup();
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

  it("user A cannot get outfit recommendations from user B's wardrobe", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const admin = supabaseAdmin();

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
        user_id: userB.id,
        image_url: `${userB.id}/shirt.jpg`,
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

    const { findMatchingOutfits } = await import("@/app/dashboard/matching-actions");
    const result = await findMatchingOutfits(item!.id, userA.client);
    expect("error" in result).toBe(true);

    await admin.from("clothing_items").delete().eq("id", item!.id);
    await userA.cleanup();
    await userB.cleanup();
  });
});
