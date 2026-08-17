import { describe, it, expect, vi } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { generateOutfitVisualization } from "@/app/dashboard/outfit-actions";
import type { ImageGenProvider } from "@/lib/providers/types";

// The fake success provider returns a placeholder URL, not a real fetchable
// image -- stub global.fetch so the action's "download the generated image"
// step succeeds deterministically without depending on a real network resource.
const realFetch = global.fetch;
global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === "https://example.com/generated.jpg") {
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
  }
  return realFetch(input as never, init);
}) as typeof fetch;

async function seedClothingItem(userId: string, categoryName: string, color: string) {
  const admin = supabaseAdmin();
  const imagePath = `${userId}/${categoryName}.jpg`;

  // getSignedUrl requires the object to actually exist in the bucket --
  // insert a real (tiny) placeholder so the action's signed-URL step works,
  // matching what a real uploaded clothing photo would provide.
  const { error: uploadError } = await admin.storage
    .from("clothing-photos")
    .upload(imagePath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) throw new Error(`Could not seed storage object: ${uploadError.message}`);

  const { data: category } = await admin
    .from("clothing_categories")
    .select("id")
    .eq("name", categoryName)
    .single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id, name")
    .eq("category_id", category!.id)
    .limit(1)
    .single();
  const { data: item } = await admin
    .from("clothing_items")
    .insert({
      user_id: userId,
      image_url: imagePath,
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

const fakeSuccessProvider: ImageGenProvider = {
  name: "fal-flux",
  generateOutfitVisualization: async () => ({
    imageUrl: "https://example.com/generated.jpg",
    requestId: "req-test-1",
    model: "fal-ai/flux-pro/kontext",
    prompt: "test prompt",
  }),
};

const fakeFailingProvider: ImageGenProvider = {
  name: "fal-flux",
  generateOutfitVisualization: async () => {
    throw new Error("simulated failure");
  },
};

describe("generateOutfitVisualization action", () => {
  it("creates a completed outfit with a stored image on success", async () => {
    const user = await createTestUser();
    const itemId = await seedClothingItem(user.id, "top", "white");

    const result = await generateOutfitVisualization([itemId], user.client, fakeSuccessProvider);
    if ("error" in result) throw new Error(result.error);

    const admin = supabaseAdmin();
    const { data: outfit } = await admin
      .from("outfits")
      .select("*")
      .eq("id", result.data.outfitId)
      .single();
    expect(outfit!.generation_status).toBe("completed");
    expect(outfit!.image_gen_provider).toBe("fal-flux");
    expect(outfit!.generated_image_url).toBeTruthy();
    expect(outfit!.generation_request_id).toBe("req-test-1");

    const { data: outfitItems } = await admin
      .from("outfit_items")
      .select("*")
      .eq("outfit_id", result.data.outfitId);
    expect(outfitItems).toHaveLength(1);

    // Regression check: the generated image must land in the dedicated
    // outfit-images bucket, not silently in clothing-photos (a real bug
    // caught via manual testing -- a shared, un-parameterized storage
    // provider instance wrote the result into the wrong bucket while still
    // reporting success). Assert existence directly rather than relying on
    // a cleanup .remove() call succeeding, which no-ops silently either way.
    const { data: signedInOutfitImages, error: outfitImagesError } = await admin.storage
      .from("outfit-images")
      .createSignedUrl(outfit!.generated_image_url, 60);
    expect(outfitImagesError).toBeNull();
    expect(signedInOutfitImages).toBeTruthy();

    const { data: wrongBucketListing } = await admin.storage
      .from("clothing-photos")
      .list(user.id, { search: outfit!.generated_image_url.split("/")[1] });
    expect(wrongBucketListing).toEqual([]);

    await admin.storage.from("clothing-photos").remove([`${user.id}/top.jpg`]);
    await admin.storage.from("outfit-images").remove([outfit!.generated_image_url]);
    await user.cleanup();
  });

  it("populates outfit_items for the realistic shared-catalog case, where the generating user does not own the clothing_items row (regression: the outfit_items RLS policy required clothing_items.user_id = auth.uid(), a leftover from before the catalog became shared/admin-owned -- silently rejecting every insert except when the generating user happened to own the item, which is exactly why this went undetected: every other test here seeds its own self-owned item)", async () => {
    const catalogOwner = await createTestUser("ADMIN");
    const shopper = await createTestUser("CUSTOMER");
    const itemId = await seedClothingItem(catalogOwner.id, "top", "shared-catalog-white");

    const result = await generateOutfitVisualization([itemId], shopper.client, fakeSuccessProvider);
    if ("error" in result) throw new Error(result.error);

    const admin2 = supabaseAdmin();
    const { data: outfitItems } = await admin2
      .from("outfit_items")
      .select("clothing_item_id")
      .eq("outfit_id", result.data.outfitId);
    expect(outfitItems).toHaveLength(1);
    expect(outfitItems![0].clothing_item_id).toBe(itemId);

    const { data: outfit2 } = await admin2
      .from("outfits")
      .select("generated_image_url")
      .eq("id", result.data.outfitId)
      .single();
    await admin2.storage.from("clothing-photos").remove([`${catalogOwner.id}/top.jpg`]);
    await admin2.storage.from("outfit-images").remove([outfit2!.generated_image_url]);
    await catalogOwner.cleanup();
    await shopper.cleanup();
  });

  it("marks the outfit failed and returns a safe error when generation fails", async () => {
    const user = await createTestUser();
    const itemId = await seedClothingItem(user.id, "bottom", "gray");

    const result = await generateOutfitVisualization([itemId], user.client, fakeFailingProvider);
    expect("error" in result).toBe(true);

    const admin = supabaseAdmin();
    const { data: outfits } = await admin
      .from("outfits")
      .select("id, generation_status, generation_error")
      .eq("user_id", user.id);
    expect(outfits![0].generation_status).toBe("failed");
    expect(outfits![0].generation_error).toBeTruthy();

    // The attempted item selection must survive a failed generation --
    // otherwise there is no way to retry the same combination later (the
    // My Looks "Retry" action depends on this).
    const { data: outfitItems } = await admin
      .from("outfit_items")
      .select("clothing_item_id")
      .eq("outfit_id", outfits![0].id);
    expect(outfitItems).toHaveLength(1);
    expect(outfitItems![0].clothing_item_id).toBe(itemId);

    await admin.storage.from("clothing-photos").remove([`${user.id}/bottom.jpg`]);
    await user.cleanup();
  });

  it("returns an error for an empty selection instead of throwing", async () => {
    const user = await createTestUser();
    const result = await generateOutfitVisualization([], user.client, fakeSuccessProvider);
    expect("error" in result).toBe(true);
    await user.cleanup();
  });

  it("persists score/explanation metadata when provided", async () => {
    const user = await createTestUser();
    const itemId = await seedClothingItem(user.id, "top", "white");

    const result = await generateOutfitVisualization([itemId], user.client, fakeSuccessProvider, {
      compatibilityScore: 87,
      scoreBreakdown: { color: 90, formality: 100, style: 80, pattern: 100, silhouette: null },
      aiExplanation: "Clean, coordinated look.",
    });
    if ("error" in result) throw new Error(result.error);

    const admin = supabaseAdmin();
    const { data: outfit } = await admin.from("outfits").select("*").eq("id", result.data.outfitId).single();
    expect(outfit!.compatibility_score).toBe(87);
    expect(outfit!.ai_explanation).toBe("Clean, coordinated look.");

    await admin.storage.from("clothing-photos").remove([`${user.id}/top.jpg`]);
    await admin.storage.from("outfit-images").remove([outfit!.generated_image_url]);
    await user.cleanup();
  });
});
