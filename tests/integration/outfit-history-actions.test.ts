import { describe, it, expect, vi } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";

async function seedCompletedLook(userId: string) {
  const admin = supabaseAdmin();
  const imagePath = `${userId}/look.jpg`;
  await admin.storage
    .from("outfit-images")
    .upload(imagePath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
      upsert: true,
    });

  const { data: outfitCategory } = await admin.from("clothing_categories").select("id").eq("name", "outerwear").single();
  const { data: outfitSub } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", outfitCategory!.id)
    .single();
  const { data: topCategory } = await admin.from("clothing_categories").select("id").eq("name", "top").single();
  const { data: topSub } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", topCategory!.id)
    .eq("name", "long_sleeve_shirt")
    .single();

  const { data: jacket } = await admin
    .from("clothing_items")
    .insert({
      user_id: userId,
      image_url: `${userId}/jacket.jpg`,
      category_id: outfitCategory!.id,
      subcategory_id: outfitSub!.id,
      primary_color: "navy",
      pattern: "solid",
      style: "business_formal",
      formality_level: 4,
      description: "navy jacket",
    })
    .select("id")
    .single();
  const { data: shirt } = await admin
    .from("clothing_items")
    .insert({
      user_id: userId,
      image_url: `${userId}/shirt.jpg`,
      category_id: topCategory!.id,
      subcategory_id: topSub!.id,
      primary_color: "white",
      pattern: "solid",
      style: "business_formal",
      formality_level: 4,
      description: "white shirt",
    })
    .select("id")
    .single();

  const { data: outfit } = await admin
    .from("outfits")
    .insert({
      user_id: userId,
      generation_status: "completed",
      generated_image_url: imagePath,
      image_gen_provider: "fal-flux",
      image_gen_model: "fal-ai/flux-pro/kontext",
      compatibility_score: 92,
      score_breakdown: { color: 90, formality: 100, style: 90, pattern: 100, silhouette: null },
      ai_explanation: "A cohesive, polished combination.",
    })
    .select("id")
    .single();

  await admin.from("outfit_items").insert([
    { outfit_id: outfit!.id, clothing_item_id: jacket!.id, role: "outerwear" },
    { outfit_id: outfit!.id, clothing_item_id: shirt!.id, role: "top" },
  ]);

  return { outfitId: outfit!.id as string, imagePath, itemIds: [jacket!.id as string, shirt!.id as string] };
}

async function seedFailedLook(userId: string) {
  const admin = supabaseAdmin();
  const { data: outfit } = await admin
    .from("outfits")
    .insert({ user_id: userId, generation_status: "failed", generation_error: "simulated failure" })
    .select("id")
    .single();
  return outfit!.id as string;
}

describe("listLooks action", () => {
  it("returns the user's own completed and failed looks, newest first", async () => {
    const user = await createTestUser();
    const { outfitId: completedId } = await seedCompletedLook(user.id);
    const failedId = await seedFailedLook(user.id);

    const { listLooks } = await import("@/app/dashboard/outfit-history-actions");
    const result = await listLooks(user.client);
    if ("error" in result) throw new Error(result.error);

    const ids = result.data.looks.map((l) => l.id);
    expect(ids).toContain(completedId);
    expect(ids).toContain(failedId);

    const completed = result.data.looks.find((l) => l.id === completedId)!;
    expect(completed.status).toBe("completed");
    expect(completed.imageSignedUrl).toBeTruthy();
    expect(completed.title).toBe("Navy Business Look");
    expect(completed.style).toBe("business_formal");
    expect(completed.compatibilityScore).toBe(92);

    const failed = result.data.looks.find((l) => l.id === failedId)!;
    expect(failed.status).toBe("failed");
    expect(failed.imageSignedUrl).toBeNull();

    const admin = supabaseAdmin();
    await admin.storage.from("outfit-images").remove([`${user.id}/look.jpg`]);
    await user.cleanup();
  });

  it("does not include another user's looks", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const { outfitId } = await seedCompletedLook(userB.id);

    const { listLooks } = await import("@/app/dashboard/outfit-history-actions");
    const result = await listLooks(userA.client);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.looks.map((l) => l.id)).not.toContain(outfitId);

    const admin = supabaseAdmin();
    await admin.storage.from("outfit-images").remove([`${userB.id}/look.jpg`]);
    await userA.cleanup();
    await userB.cleanup();
  });

  it("never invokes the image generation provider", async () => {
    const user = await createTestUser();
    await seedCompletedLook(user.id);

    const providers = await import("@/lib/providers");
    const spy = vi.spyOn(providers, "getImageGenProvider");

    const { listLooks } = await import("@/app/dashboard/outfit-history-actions");
    await listLooks(user.client);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
    const admin = supabaseAdmin();
    await admin.storage.from("outfit-images").remove([`${user.id}/look.jpg`]);
    await user.cleanup();
  });
});

describe("getLookDetail action", () => {
  it("returns the full look with items, score, and explanation", async () => {
    const user = await createTestUser();
    const { outfitId, itemIds } = await seedCompletedLook(user.id);

    const { getLookDetail } = await import("@/app/dashboard/outfit-history-actions");
    const result = await getLookDetail(outfitId, user.client);
    if ("error" in result) throw new Error(result.error);

    expect(result.data.look.id).toBe(outfitId);
    expect(result.data.look.imageSignedUrl).toBeTruthy();
    expect(result.data.look.compatibilityScore).toBe(92);
    expect(result.data.look.aiExplanation).toBe("A cohesive, polished combination.");
    expect(result.data.look.scoreBreakdown).toEqual({
      color: 90,
      formality: 100,
      style: 90,
      pattern: 100,
      silhouette: null,
    });
    expect(result.data.look.items.map((i) => i.id).sort()).toEqual([...itemIds].sort());

    const admin = supabaseAdmin();
    await admin.storage.from("outfit-images").remove([`${user.id}/look.jpg`]);
    await user.cleanup();
  });

  it("does not let one user read another user's look", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const { outfitId } = await seedCompletedLook(userB.id);

    const { getLookDetail } = await import("@/app/dashboard/outfit-history-actions");
    const result = await getLookDetail(outfitId, userA.client);
    expect("error" in result).toBe(true);

    const admin = supabaseAdmin();
    await admin.storage.from("outfit-images").remove([`${userB.id}/look.jpg`]);
    await userA.cleanup();
    await userB.cleanup();
  });

  it("returns an error for a nonexistent look instead of throwing", async () => {
    const user = await createTestUser();
    const { getLookDetail } = await import("@/app/dashboard/outfit-history-actions");
    const result = await getLookDetail("00000000-0000-0000-0000-000000000000", user.client);
    expect("error" in result).toBe(true);
    await user.cleanup();
  });
});

describe("deleteLook action", () => {
  it("deletes the outfit, its outfit_items, and the storage image, but keeps the clothing items", async () => {
    const user = await createTestUser();
    const { outfitId, imagePath, itemIds } = await seedCompletedLook(user.id);

    const { deleteLook } = await import("@/app/dashboard/outfit-history-actions");
    const result = await deleteLook(outfitId, user.client);
    expect("error" in result).toBe(false);

    const admin = supabaseAdmin();
    const { data: outfitRow } = await admin.from("outfits").select("id").eq("id", outfitId);
    expect(outfitRow).toEqual([]);

    const { data: outfitItemRows } = await admin.from("outfit_items").select("id").eq("outfit_id", outfitId);
    expect(outfitItemRows).toEqual([]);

    const { data: clothingRows } = await admin.from("clothing_items").select("id").in("id", itemIds);
    expect(clothingRows).toHaveLength(2);

    const { data: signedAfterDelete } = await admin.storage.from("outfit-images").createSignedUrl(imagePath, 60);
    expect(signedAfterDelete).toBeNull();

    await admin.from("clothing_items").delete().in("id", itemIds);
    await user.cleanup();
  });

  it("does not let one user delete another user's look", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const { outfitId, itemIds } = await seedCompletedLook(userB.id);

    const { deleteLook } = await import("@/app/dashboard/outfit-history-actions");
    const result = await deleteLook(outfitId, userA.client);
    expect("error" in result).toBe(true);

    const admin = supabaseAdmin();
    const { data: stillThere } = await admin.from("outfits").select("id").eq("id", outfitId);
    expect(stillThere).toHaveLength(1);

    await admin.storage.from("outfit-images").remove([`${userB.id}/look.jpg`]);
    await admin.from("clothing_items").delete().in("id", itemIds);
    await admin.from("outfits").delete().eq("id", outfitId);
    await userA.cleanup();
    await userB.cleanup();
  });
});
