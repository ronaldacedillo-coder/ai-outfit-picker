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
});
