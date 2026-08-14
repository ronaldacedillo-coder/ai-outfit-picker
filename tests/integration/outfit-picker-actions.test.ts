import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { getOutfitImageUrl } from "@/app/dashboard/outfit-picker-actions";

describe("getOutfitImageUrl action", () => {
  it("returns a signed URL for the caller's own completed outfit", async () => {
    const user = await createTestUser();
    const admin = supabaseAdmin();
    const path = `${user.id}/generated.jpg`;
    await admin.storage
      .from("outfit-images")
      .upload(path, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), {
        contentType: "image/jpeg",
        upsert: true,
      });
    const { data: outfit } = await admin
      .from("outfits")
      .insert({ user_id: user.id, generation_status: "completed", generated_image_url: path })
      .select("id")
      .single();

    const result = await getOutfitImageUrl(outfit!.id, user.client);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.imageUrl).toContain("http");

    await admin.storage.from("outfit-images").remove([path]);
    await admin.from("outfits").delete().eq("id", outfit!.id);
    await user.cleanup();
  });

  it("does not let one user resolve another user's outfit image", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const admin = supabaseAdmin();
    const path = `${userB.id}/generated.jpg`;
    await admin.storage
      .from("outfit-images")
      .upload(path, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), {
        contentType: "image/jpeg",
        upsert: true,
      });
    const { data: outfit } = await admin
      .from("outfits")
      .insert({ user_id: userB.id, generation_status: "completed", generated_image_url: path })
      .select("id")
      .single();

    const result = await getOutfitImageUrl(outfit!.id, userA.client);
    expect("error" in result).toBe(true);

    await admin.storage.from("outfit-images").remove([path]);
    await admin.from("outfits").delete().eq("id", outfit!.id);
    await userA.cleanup();
    await userB.cleanup();
  });

  it("returns an error for a nonexistent outfit instead of throwing", async () => {
    const user = await createTestUser();
    const result = await getOutfitImageUrl("00000000-0000-0000-0000-000000000000", user.client);
    expect("error" in result).toBe(true);
    await user.cleanup();
  });
});
