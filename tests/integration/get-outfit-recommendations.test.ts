import { describe, it, expect, vi } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { createMatchingOverride } from "@/app/admin/matching-overrides/actions";
import { getOutfitRecommendationsAction, findMatchingOutfits } from "@/app/dashboard/matching-actions";
import type { AIProvider } from "@/lib/providers/types";

const fakeAI: AIProvider = {
  analyzeClothingImage: vi.fn(),
  explainOutfitMatch: vi.fn().mockResolvedValue({ explanation: "A coordinated pairing.", conflicts: [] }),
};

async function seedItem(
  adminId: string,
  categoryName: string,
  subcategoryName: string,
  color: string,
  formality: number,
  suffix: string
) {
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
      user_id: adminId,
      image_url: `${adminId}/${subcategoryName}-${color}-${suffix}.jpg`,
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

describe("getOutfitRecommendationsAction", () => {
  it("surfaces an admin-curated combination first, labeled admin_override, ahead of AI-ranked results", async () => {
    const adminUser = await createTestUser("ADMIN");
    const customerUser = await createTestUser("CUSTOMER");

    const jacketId = await seedItem(adminUser.id, "outerwear", "blazer", "navy", 4, "gor1");
    const pickedBottomId = await seedItem(adminUser.id, "bottom", "pants", "burgundy", 2, "gor1");
    const otherBottomId = await seedItem(adminUser.id, "bottom", "pants", "charcoal", 4, "gor1");

    // Left to the deterministic scorer alone, the low-formality burgundy
    // bottom would rank behind the well-matched charcoal one -- the admin
    // rule is what pins it to the top regardless of score.
    const ruleResult = await createMatchingOverride(
      { baseItemId: jacketId, matchedItemId: pickedBottomId, reciprocal: false, priority: 0 },
      adminUser.client
    );
    if ("error" in ruleResult) throw new Error(ruleResult.error);

    const result = await getOutfitRecommendationsAction(jacketId, undefined, undefined, customerUser.client, fakeAI);
    if ("error" in result) throw new Error(result.error);

    expect(result.data.candidates.length).toBeGreaterThan(1);

    // The shared catalog may contain other tops too, so every combination
    // that happens to include pickedBottomId alongside the jacket gets
    // tagged admin_override, not just one -- the real invariant is
    // grouping (every admin_override candidate sorts before every
    // non-admin_override one), not "exactly one at index 0".
    const sources = result.data.candidates.map((c) => c.source);
    const lastOverrideIndex = sources.lastIndexOf("admin_override");
    const firstNonOverrideIndex = sources.findIndex((s) => s !== "admin_override");
    expect(lastOverrideIndex).toBeGreaterThanOrEqual(0);
    if (firstNonOverrideIndex !== -1) {
      expect(lastOverrideIndex).toBeLessThan(firstNonOverrideIndex);
    }
    expect(result.data.candidates.some((c) => c.source === "admin_override" && c.garments.some((g) => g.id === pickedBottomId))).toBe(
      true
    );

    // Every candidate is a real, structurally valid, real-scored
    // combination from the existing engine -- not a placeholder.
    for (const candidate of result.data.candidates) {
      expect(["admin_override", "ai", "fallback"]).toContain(candidate.source);
      expect(candidate.score).toBeGreaterThan(0);
    }

    const admin = supabaseAdmin();
    await admin.from("matching_overrides").delete().eq("id", ruleResult.data.id);
    await admin.from("clothing_items").delete().in("id", [jacketId, pickedBottomId, otherBottomId]);
    await adminUser.cleanup();
    await customerUser.cleanup();
  });

  it("findMatchingOutfits (backward-compatible wrapper) strips the source tag", async () => {
    const adminUser = await createTestUser("ADMIN");
    const jacketId = await seedItem(adminUser.id, "outerwear", "blazer", "gray", 4, "gor2");
    await seedItem(adminUser.id, "bottom", "pants", "black", 4, "gor2");

    const result = await findMatchingOutfits(jacketId, adminUser.client, fakeAI);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.candidates.length).toBeGreaterThan(0);
    for (const c of result.data.candidates) {
      expect((c as unknown as { source?: string }).source).toBeUndefined();
    }

    await adminUser.cleanup();
  });
});
