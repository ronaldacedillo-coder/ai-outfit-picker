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
  injectedImageGen?: ImageGenProvider,
  matchMetadata?: {
    compatibilityScore?: number;
    scoreBreakdown?: Record<string, number | null>;
    aiExplanation?: string;
  }
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
    .insert({
      user_id: user.id,
      generation_status: "processing",
      compatibility_score: matchMetadata?.compatibilityScore ?? null,
      score_breakdown: matchMetadata?.scoreBreakdown ?? null,
      ai_explanation: matchMetadata?.aiExplanation ?? null,
    })
    .select("id")
    .single();
  if (insertError || !outfit) {
    return { error: "Couldn't start generation — please try again." };
  }

  const rows = items as unknown as ClothingItemQueryRow[];

  // Recorded immediately, before generation is attempted, so the item
  // selection survives a failed generation -- otherwise a failed outfit
  // retains no trace of what was being generated, making a "retry the
  // same combination" action impossible (discovered while building the
  // My Looks retry flow).
  await supabase.from("outfit_items").insert(
    rows.map((item) => ({
      outfit_id: outfit.id,
      clothing_item_id: item.id,
      role: item.clothing_categories?.name ?? "top",
    }))
  );

  // Two distinct buckets, two provider instances: garment reference photos
  // live in the wardrobe's private clothing-photos bucket; the generated
  // result is written to its own private outfit-images bucket. Using a
  // single shared provider here previously caused the generated image to
  // silently land in clothing-photos instead -- caught via manual testing,
  // not by the unit/integration suite, which is why
  // tests/unit/supabase-storage-provider.test.ts and the bucket assertion
  // in the integration test below now exist.
  const clothingStorage = getStorageProvider(supabase);
  const outfitStorage = getStorageProvider(supabase, "outfit-images");

  try {
    const garments: OutfitGarmentInput[] = await Promise.all(
      rows.map(async (item) => ({
        imageUrl: await clothingStorage.getSignedUrl(item.image_url, 600),
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
    await outfitStorage.uploadImage({ userId: user.id, file: blob, path });

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
