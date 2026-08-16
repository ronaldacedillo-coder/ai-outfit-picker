import { describe, it, expect, vi } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import {
  uploadClothingPhoto,
  analyzeClothingPhoto,
  saveClothingItem,
  updateClothingItem,
  deleteClothingItem,
} from "@/app/dashboard/actions";
import type { AIProvider } from "@/lib/providers/types";

async function getFirstCategoryAndSubcategory() {
  const admin = supabaseAdmin();
  const { data: category } = await admin.from("clothing_categories").select("id").limit(1).single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", category!.id)
    .limit(1)
    .single();
  return { categoryId: category!.id, subcategoryId: subcategory!.id };
}

describe("clothing item actions", () => {
  it("uploads a photo, saves an item, updates it, then deletes it", async () => {
    const user = await createTestUser("ADMIN");
    const { categoryId, subcategoryId } = await getFirstCategoryAndSubcategory();

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const uploadResult = await uploadClothingPhoto(blob, "jpg", user.client);
    if ("error" in uploadResult) throw new Error(uploadResult.error);

    const saveResult = await saveClothingItem(
      {
        categoryId,
        subcategoryId,
        imagePath: uploadResult.data.path,
        primaryColor: "blue",
        secondaryColors: [],
        pattern: "solid",
        style: "casual",
        formalityLevel: 2,
        description: "test item",
        userEdited: true,
      },
      user.client
    );
    if ("error" in saveResult) throw new Error(saveResult.error);

    const admin = supabaseAdmin();
    const { data: saved } = await admin.from("clothing_items").select("*").eq("id", saveResult.data.id).single();
    expect(saved!.primary_color).toBe("blue");
    expect(saved!.image_url).toBe(uploadResult.data.path);

    const updateResult = await updateClothingItem(
      saveResult.data.id,
      {
        categoryId,
        subcategoryId,
        imagePath: uploadResult.data.path,
        primaryColor: "navy",
        secondaryColors: [],
        pattern: "solid",
        style: "casual",
        formalityLevel: 2,
        description: "updated",
        userEdited: true,
      },
      user.client
    );
    expect("error" in updateResult).toBe(false);

    const { data: updated } = await admin
      .from("clothing_items")
      .select("primary_color")
      .eq("id", saveResult.data.id)
      .single();
    expect(updated!.primary_color).toBe("navy");

    const deleteResult = await deleteClothingItem(saveResult.data.id, user.client);
    expect("error" in deleteResult).toBe(false);

    const { data: gone } = await admin.from("clothing_items").select("id").eq("id", saveResult.data.id);
    expect(gone).toEqual([]);

    await user.cleanup();
  });

  it("rejects catalog mutations from a non-admin (CUSTOMER) with Not authorized", async () => {
    const customer = await createTestUser("CUSTOMER");
    const { categoryId, subcategoryId } = await getFirstCategoryAndSubcategory();

    const uploadResult = await uploadClothingPhoto(
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
      "jpg",
      customer.client
    );
    expect(uploadResult).toEqual({ error: "Not authorized." });

    const saveResult = await saveClothingItem(
      {
        categoryId,
        subcategoryId,
        imagePath: `${customer.id}/x.jpg`,
        primaryColor: "blue",
        secondaryColors: [],
        pattern: "solid",
        style: "casual",
        formalityLevel: 2,
        description: "should be rejected",
        userEdited: true,
      },
      customer.client
    );
    expect(saveResult).toEqual({ error: "Not authorized." });

    await customer.cleanup();
  });

  it("returns a friendly error and does not throw when input is invalid", async () => {
    const user = await createTestUser("ADMIN");
    const result = await saveClothingItem(
      // @ts-expect-error deliberately invalid for this test
      { categoryId: -1 },
      user.client
    );
    expect("error" in result).toBe(true);
    await user.cleanup();
  });

  it("falls back to manual entry when the AI provider fails", async () => {
    const user = await createTestUser("ADMIN");
    const path = `${user.id}/does-not-matter.jpg`;
    const failingProvider: AIProvider = {
      analyzeClothingImage: async () => {
        throw new Error("quota exceeded");
      },
      explainOutfitMatch: async () => ({ explanation: "", conflicts: [] }),
    };

    const result = await analyzeClothingPhoto(path, user.client, failingProvider);
    expect("error" in result).toBe(true);

    await user.cleanup();
  });

  it("logs the real failure server-side instead of swallowing it silently", async () => {
    const user = await createTestUser("ADMIN");
    // A real uploaded file (not just a plausible-looking path) so the
    // failure genuinely originates from the injected AI provider, not an
    // upstream "signed URL: object not found" error from a nonexistent file.
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const uploadResult = await uploadClothingPhoto(blob, "jpg", user.client);
    if ("error" in uploadResult) throw new Error(uploadResult.error);

    const failingProvider: AIProvider = {
      analyzeClothingImage: async () => {
        throw new Error("quota exceeded");
      },
      explainOutfitMatch: async () => ({ explanation: "", conflicts: [] }),
    };

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await analyzeClothingPhoto(uploadResult.data.path, user.client, failingProvider);
    expect("error" in result).toBe(true);

    expect(errorSpy).toHaveBeenCalledWith(
      "[analyzeClothingPhoto] AI analysis failed",
      expect.objectContaining({ name: "Error", message: "quota exceeded" })
    );

    errorSpy.mockRestore();
    await user.cleanup();
  });
});
