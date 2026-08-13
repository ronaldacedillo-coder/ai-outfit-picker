import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { SupabaseStorageProvider } from "@/lib/providers/supabase-storage";

describe("SupabaseStorageProvider", () => {
  it("uploads, signs, and deletes an image scoped to the user's folder", async () => {
    const user = await createTestUser();
    const provider = new SupabaseStorageProvider(user.client);
    const path = `${user.id}/test.jpg`;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    const uploadResult = await provider.uploadImage({ userId: user.id, file: blob, path });
    expect(uploadResult.url).toBe(path);

    const signedUrl = await provider.getSignedUrl(path);
    expect(signedUrl).toContain("clothing-photos");

    const fetchResponse = await fetch(signedUrl);
    expect(fetchResponse.ok).toBe(true);

    await provider.deleteImage(path);
    await user.cleanup();
  });
});
