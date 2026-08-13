import { describe, it, expect, vi } from "vitest";
import { SupabaseStorageProvider } from "@/lib/providers/supabase-storage";

// Regression test: a real manual FLUX generation test found that outfit
// images were silently landing in the "clothing-photos" bucket instead of
// the dedicated "outfit-images" bucket, because the bucket name was
// hardcoded in this class instead of being configurable per instance.
function makeFakeSupabase() {
  const fromMock = vi.fn().mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.com/signed" }, error: null }),
  });
  return { storage: { from: fromMock } } as never;
}

describe("SupabaseStorageProvider bucket routing", () => {
  it("defaults to the clothing-photos bucket when none is specified", async () => {
    const supabase = makeFakeSupabase();
    const provider = new SupabaseStorageProvider(supabase);
    await provider.uploadImage({ userId: "u1", file: new Blob(["x"]), path: "u1/a.jpg" });
    expect((supabase as { storage: { from: ReturnType<typeof vi.fn> } }).storage.from).toHaveBeenCalledWith(
      "clothing-photos"
    );
  });

  it("uses the bucket passed to the constructor for upload, delete, and signed URLs", async () => {
    const supabase = makeFakeSupabase();
    const provider = new SupabaseStorageProvider(supabase, "outfit-images");

    await provider.uploadImage({ userId: "u1", file: new Blob(["x"]), path: "u1/a.jpg" });
    await provider.deleteImage("u1/a.jpg");
    await provider.getSignedUrl("u1/a.jpg");

    const fromMock = (supabase as { storage: { from: ReturnType<typeof vi.fn> } }).storage.from;
    expect(fromMock).toHaveBeenCalledWith("outfit-images");
    expect(fromMock).not.toHaveBeenCalledWith("clothing-photos");
  });
});
