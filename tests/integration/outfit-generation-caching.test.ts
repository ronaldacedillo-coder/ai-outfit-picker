import { describe, it, expect, vi } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { generateOutfitVisualization } from "@/app/dashboard/outfit-actions";
import type { ImageGenProvider } from "@/lib/providers/types";

// Same fetch-stubbing approach as outfit-generation-actions.test.ts: the
// fake provider returns a placeholder URL, not a real fetchable image.
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

async function seedClothingItem(userId: string, categoryName: string, color: string, suffix: string) {
  const admin = supabaseAdmin();
  const imagePath = `${userId}/${categoryName}-${suffix}.jpg`;

  const { error: uploadError } = await admin.storage
    .from("clothing-photos")
    .upload(imagePath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) throw new Error(`Could not seed storage object: ${uploadError.message}`);

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

function countingProvider(): { provider: ImageGenProvider; callCount: () => number } {
  let calls = 0;
  return {
    callCount: () => calls,
    provider: {
      name: "fal-flux",
      generateOutfitVisualization: async () => {
        calls += 1;
        return {
          imageUrl: "https://example.com/generated.jpg",
          requestId: `req-${calls}`,
          model: "fal-ai/flux-pro/kontext",
          prompt: "test prompt",
        };
      },
    },
  };
}

describe("generateOutfitVisualization caching", () => {
  it("returns the cached outfit and does not call FLUX again for an identical combination", async () => {
    const user = await createTestUser();
    const itemId = await seedClothingItem(user.id, "top", "cache-white", "a");
    const { provider, callCount } = countingProvider();

    const first = await generateOutfitVisualization([itemId], user.client, provider);
    if ("error" in first) throw new Error(first.error);
    expect(callCount()).toBe(1);

    const second = await generateOutfitVisualization([itemId], user.client, provider);
    if ("error" in second) throw new Error(second.error);

    expect(callCount()).toBe(1); // no second FLUX call
    expect(second.data.outfitId).toBe(first.data.outfitId);

    const admin = supabaseAdmin();
    await admin.from("outfits").delete().eq("id", first.data.outfitId);
    await admin.storage.from("outfit-images").remove([first.data.imageUrl]);
    await admin.storage.from("clothing-photos").remove([`${user.id}/top-cache-a.jpg`]);
    await user.cleanup();
  });

  it("computes a different cache entry for a different occasion", async () => {
    const user = await createTestUser();
    const itemId = await seedClothingItem(user.id, "top", "cache-navy", "b");
    const { provider, callCount } = countingProvider();

    const office = await generateOutfitVisualization([itemId], user.client, provider, { occasion: "OFFICE" });
    if ("error" in office) throw new Error(office.error);
    const weekend = await generateOutfitVisualization([itemId], user.client, provider, { occasion: "WEEKEND" });
    if ("error" in weekend) throw new Error(weekend.error);

    expect(callCount()).toBe(2);
    expect(office.data.outfitId).not.toBe(weekend.data.outfitId);

    const admin = supabaseAdmin();
    await admin.from("outfits").delete().eq("id", office.data.outfitId);
    await admin.from("outfits").delete().eq("id", weekend.data.outfitId);
    await admin.storage.from("outfit-images").remove([office.data.imageUrl, weekend.data.imageUrl]);
    await admin.storage.from("clothing-photos").remove([`${user.id}/top-cache-b.jpg`]);
    await user.cleanup();
  });

  it("makes exactly one FLUX call when two concurrent requests target the same combination", async () => {
    const user = await createTestUser();
    const itemId = await seedClothingItem(user.id, "top", "cache-concurrent", "c");
    const { provider, callCount } = countingProvider();

    const [a, b] = await Promise.all([
      generateOutfitVisualization([itemId], user.client, provider),
      generateOutfitVisualization([itemId], user.client, provider),
    ]);

    if ("error" in a) throw new Error(a.error);
    if ("error" in b) throw new Error(b.error);

    expect(callCount()).toBe(1);
    expect(a.data.outfitId).toBe(b.data.outfitId);

    const admin = supabaseAdmin();
    await admin.from("outfits").delete().eq("id", a.data.outfitId);
    await admin.storage.from("outfit-images").remove([a.data.imageUrl]);
    await admin.storage.from("clothing-photos").remove([`${user.id}/top-cache-c.jpg`]);
    await user.cleanup();
  });
});
