import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./types";

const DEFAULT_BUCKET = "clothing-photos";

export class SupabaseStorageProvider implements StorageProvider {
  private readonly bucket: string;

  constructor(
    private readonly supabase: SupabaseClient,
    bucket: string = DEFAULT_BUCKET
  ) {
    this.bucket = bucket;
  }

  async uploadImage(input: { userId: string; file: Blob; path: string }): Promise<{ url: string }> {
    const { error } = await this.supabase.storage.from(this.bucket).upload(input.path, input.file, {
      contentType: input.file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    return { url: input.path };
  }

  async deleteImage(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([path]);
    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  }

  async getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new Error(`Could not create signed URL: ${error?.message}`);
    }
    return data.signedUrl;
  }
}
