"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getStorageProvider } from "@/lib/providers";
import { requireUser } from "@/lib/auth/requireUser";

type ActionResult<T> = { data: T } | { error: string };

// Reads only -- resolves a signed URL for an already-generated outfit image.
// Does not touch the FLUX generation path in outfit-actions.ts.
export async function getOutfitImageUrl(
  outfitId: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ imageUrl: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const { data: outfit, error } = await supabase
    .from("outfits")
    .select("generated_image_url")
    .eq("id", outfitId)
    .eq("user_id", user.id)
    .single();

  if (error || !outfit?.generated_image_url) {
    return { error: "That outfit couldn't be found." };
  }

  const storage = getStorageProvider(supabase, "outfit-images");
  const imageUrl = await storage.getSignedUrl(outfit.generated_image_url);
  return { data: { imageUrl } };
}
