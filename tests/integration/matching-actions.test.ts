import { describe, it, expect, vi } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { findMatchingOutfits } from "@/app/dashboard/matching-actions";
import type { AIProvider } from "@/lib/providers/types";

// Real Gemini calls are unnecessary here -- the deterministic matching logic
// is what this test verifies, matching the existing injectedImageGen DI
// pattern used for FLUX in outfit-generation-actions.test.ts.
const fakeAI: AIProvider = {
  analyzeClothingImage: vi.fn(),
  explainOutfitMatch: vi.fn().mockResolvedValue({ explanation: "A coordinated pairing.", conflicts: [] }),
};

async function seedItem(userId: string, categoryName: string, subcategoryName: string, color: string, formality: number) {
  const admin = supabaseAdmin();
  const { data: category } = await admin.from("clothing_categories").select("id").eq("name", categoryName).single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", category!.id)
    .eq("name", subcategoryName)
    .single();
  const { data: item } = await admin
    .from("clothing_items")
    .insert({
      user_id: userId,
      image_url: `${userId}/${subcategoryName}-${color}.jpg`,
      category_id: category!.id,
      subcategory_id: subcategory!.id,
      primary_color: color,
      pattern: "solid",
      style: "business_formal",
      formality_level: formality,
      description: `${color} ${subcategoryName}`,
    })
    .select("id")
    .single();
  return item!.id as string;
}

describe("findMatchingOutfits action", () => {
  it("returns ranked candidates that always include the selected item", async () => {
    const user = await createTestUser();
    const jacketId = await seedItem(user.id, "outerwear", "blazer", "navy", 4);
    await seedItem(user.id, "top", "long_sleeve_shirt", "white", 4);
    await seedItem(user.id, "bottom", "pants", "charcoal", 4);

    const result = await findMatchingOutfits(jacketId, user.client, fakeAI);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.candidates.length).toBeGreaterThan(0);
    for (const c of result.data.candidates) {
      expect(c.garments.some((g) => g.id === jacketId)).toBe(true);
      expect(c.explanation).toBeTruthy();
    }

    await user.cleanup();
  });

  // "Returns empty when no complementary items exist" is no longer a
  // testable scenario now that clothing_items is a shared catalog
  // (migration 0005): composeOutfitCandidates draws from the *entire*
  // catalog, not a per-user wardrobe, so as soon as any other top/bottom
  // exists anywhere in the catalog -- from another test, another admin,
  // or the seed data reassigned by migration 0006 -- a candidate will be
  // found. There's no remaining way to deterministically isolate "empty
  // catalog" in a shared-catalog integration test.

  it("returns an error for a nonexistent item instead of throwing", async () => {
    const user = await createTestUser();
    const result = await findMatchingOutfits("00000000-0000-0000-0000-000000000000", user.client);
    expect("error" in result).toBe(true);
    await user.cleanup();
  });
});
