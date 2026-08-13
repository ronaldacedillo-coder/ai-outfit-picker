"use server";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getImageGenProvider, getStorageProvider } from "@/lib/providers";
import type { ImageGenProvider, OutfitGarmentInput } from "@/lib/providers/types";

type ActionResult<T> = { data: T } | { error: string };

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

interface ClothingItemQueryRow {
  id: string;
  image_url: string;
  primary_color: string | null;
  pattern: string | null;
  style: string | null;
  clothing_categories: { name: string } | null;
  clothing_subcategories: { name: string } | null;
}

export async function generateOutfitVisualization(
  clothingItemIds: string[],
  injectedClient?: SupabaseClient,
  injectedImageGen?: ImageGenProvider
): Promise<ActionResult<{ outfitId: string; imageUrl: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };
  if (clothingItemIds.length === 0) return { error: "Select at least one clothing item." };

  const { data: items, error: itemsError } = await supabase
    .from("clothing_items")
    .select(
      "id, image_url, primary_color, pattern, style, clothing_categories(name), clothing_subcategories(name)"
    )
    .in("id", clothingItemIds)
    .eq("user_id", user.id);

  if (itemsError || !items || items.length !== clothingItemIds.length) {
    return { error: "Some selected items could not be found." };
  }

  const { data: outfit, error: insertError } = await supabase
    .from("outfits")
    .insert({ user_id: user.id, generation_status: "processing" })
    .select("id")
    .single();
  if (insertError || !outfit) {
    return { error: "Couldn't start generation — please try again." };
  }

  const storage = getStorageProvider(supabase);

  try {
    const rows = items as unknown as ClothingItemQueryRow[];
    const garments: OutfitGarmentInput[] = await Promise.all(
      rows.map(async (item) => ({
        imageUrl: await storage.getSignedUrl(item.image_url, 600),
        role: item.clothing_categories?.name ?? "top",
        category: item.clothing_categories?.name ?? "",
        subcategory: item.clothing_subcategories?.name ?? "",
        primaryColor: item.primary_color ?? "",
        pattern: item.pattern ?? "solid",
        style: item.style ?? "casual",
      }))
    );

    const imageGen = injectedImageGen ?? getImageGenProvider();
    const generated = await imageGen.generateOutfitVisualization({ garments });

    const imageResponse = await fetch(generated.imageUrl);
    if (!imageResponse.ok) {
      throw new Error("Could not download the generated image.");
    }
    const blob = await imageResponse.blob();
    const path = `${user.id}/${randomUUID()}.jpg`;
    await storage.uploadImage({ userId: user.id, file: blob, path });

    await supabase
      .from("outfits")
      .update({
        generation_status: "completed",
        generated_image_url: path,
        image_gen_provider: imageGen.name,
        image_gen_model: generated.model,
        generation_request_id: generated.requestId,
        generation_prompt: generated.prompt,
      })
      .eq("id", outfit.id);

    await supabase.from("outfit_items").insert(
      rows.map((item) => ({
        outfit_id: outfit.id,
        clothing_item_id: item.id,
        role: item.clothing_categories?.name ?? "top",
      }))
    );

    return { data: { outfitId: outfit.id, imageUrl: path } };
  } catch (err) {
    await supabase
      .from("outfits")
      .update({
        generation_status: "failed",
        generation_error: err instanceof Error ? err.message : "Generation failed.",
      })
      .eq("id", outfit.id);
    return { error: "Couldn't generate your outfit visualization — please try again." };
  }
}
