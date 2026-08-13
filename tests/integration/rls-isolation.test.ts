import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { SupabaseStorageProvider } from "@/lib/providers/supabase-storage";

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
});
