import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./types";

const BUCKET = "clothing-photos";

export class SupabaseStorageProvider implements StorageProvider {
  constructor(private readonly supabase: SupabaseClient) {}

  async uploadImage(input: { userId: string; file: Blob; path: string }): Promise<{ url: string }> {
    const { error } = await this.supabase.storage.from(BUCKET).upload(input.path, input.file, {
      contentType: input.file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    return { url: input.path };
  }

  async deleteImage(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  }

  async getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new Error(`Could not create signed URL: ${error?.message}`);
    }
    return data.signedUrl;
  }
}
