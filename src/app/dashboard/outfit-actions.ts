"use server";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getImageGenProvider, getStorageProvider } from "@/lib/providers";
import type { ImageGenProvider, OutfitGarmentInput } from "@/lib/providers/types";
import { requireUser } from "@/lib/auth/requireUser";
import { computeCombinationHash } from "@/lib/outfit/combinationHash";
import { PROMPT_VERSION } from "@/lib/outfit/buildVisualizationPrompt";
import { getCurrentRuleVersion } from "@/lib/matching/getRuleVersion";

type ActionResult<T> = { data: T } | { error: string };

const UNIQUE_VIOLATION = "23505";
const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 20; // ~20s cap

interface ClothingItemQueryRow {
  id: string;
  image_url: string;
  primary_color: string | null;
  primary_color_hex: string | null;
  pattern: string | null;
  style: string | null;
  ai_analysis: { visualDetails?: Record<string, string> } | null;
  clothing_categories: { name: string } | null;
  clothing_subcategories: { name: string } | null;
}

interface OutfitRow {
  id: string;
  generation_status: string;
  generated_image_url: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOutfitByHash(
  supabase: SupabaseClient,
  hash: string
): Promise<OutfitRow | null> {
  const { data } = await supabase
    .from("outfits")
    .select("id, generation_status, generated_image_url")
    .eq("combination_hash", hash)
    .neq("generation_status", "failed")
    .maybeSingle();
  return (data as OutfitRow | null) ?? null;
}

// Waits for a 'processing' row (found via the cache lookup, meaning
// someone else is already generating this exact combination) to settle,
// rather than starting a second, redundant, paid FLUX call. Bounded so a
// server action never hangs indefinitely if the other request stalls.
async function pollUntilSettled(
  supabase: SupabaseClient,
  outfitId: string
): Promise<ActionResult<{ outfitId: string; imageUrl: string }>> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const { data } = await supabase
      .from("outfits")
      .select("id, generation_status, generated_image_url")
      .eq("id", outfitId)
      .single();
    if (data?.generation_status === "completed" && data.generated_image_url) {
      return { data: { outfitId: data.id, imageUrl: data.generated_image_url } };
    }
    if (data?.generation_status === "failed") {
      return { error: "Couldn't generate your outfit visualization — please try again." };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { error: "This look is still generating — please check back in a moment." };
}

export async function generateOutfitVisualization(
  clothingItemIds: string[],
  injectedClient?: SupabaseClient,
  injectedImageGen?: ImageGenProvider,
  matchMetadata?: {
    compatibilityScore?: number;
    scoreBreakdown?: Record<string, number | null>;
    aiExplanation?: string;
    occasion?: string;
    styleContext?: string;
  }
): Promise<ActionResult<{ outfitId: string; imageUrl: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };
  if (clothingItemIds.length === 0) return { error: "Select at least one clothing item." };

  // No .eq("user_id", ...) filter: any authenticated role can generate a
  // look from any shared-catalog item (migration 0005) -- ownership on
  // clothing_items no longer gates visibility, only ADMIN CRUD does.
  const { data: items, error: itemsError } = await supabase
    .from("clothing_items")
    .select(
      "id, image_url, primary_color, primary_color_hex, pattern, style, ai_analysis, clothing_categories(name), clothing_subcategories(name)"
    )
    .in("id", clothingItemIds);

  if (itemsError || !items || items.length !== clothingItemIds.length) {
    return { error: "Some selected items could not be found." };
  }

  const ruleVersion = await getCurrentRuleVersion(supabase);
  const combinationHash = computeCombinationHash({
    clothingItemIds,
    occasion: matchMetadata?.occasion,
    styleContext: matchMetadata?.styleContext,
    ruleVersion,
    promptVersion: PROMPT_VERSION,
  });

  // Cache check: an identical combination (same items, occasion, style
  // context, admin-rule state, and prompt template) that's already
  // completed is returned immediately, with no FLUX call at all.
  const existing = await fetchOutfitByHash(supabase, combinationHash);
  if (existing?.generation_status === "completed" && existing.generated_image_url) {
    return { data: { outfitId: existing.id, imageUrl: existing.generated_image_url } };
  }
  if (existing?.generation_status === "processing") {
    return pollUntilSettled(supabase, existing.id);
  }

  const rows = items as unknown as ClothingItemQueryRow[];

  const outfitInsert = {
    user_id: user.id,
    generation_status: "processing",
    compatibility_score: matchMetadata?.compatibilityScore ?? null,
    score_breakdown: matchMetadata?.scoreBreakdown ?? null,
    ai_explanation: matchMetadata?.aiExplanation ?? null,
    combination_hash: combinationHash,
    rule_version: ruleVersion,
    prompt_version: PROMPT_VERSION,
    occasion: matchMetadata?.occasion ?? null,
    style_context: matchMetadata?.styleContext ?? null,
  };

  const { data: outfit, error: insertError } = await supabase
    .from("outfits")
    .insert(outfitInsert)
    .select("id")
    .single();

  if (insertError || !outfit) {
    // Lost a race between the cache check above and this insert -- another
    // request claimed the same combination_hash first (the partial unique
    // index in migration 0010 is the actual concurrency primitive; this
    // insert is the "reserve the slot" step, done before ever calling
    // FLUX, so a losing request never wastes a real paid generation call).
    if (insertError?.code === UNIQUE_VIOLATION) {
      const winner = await fetchOutfitByHash(supabase, combinationHash);
      if (winner?.generation_status === "completed" && winner.generated_image_url) {
        return { data: { outfitId: winner.id, imageUrl: winner.generated_image_url } };
      }
      if (winner) {
        return pollUntilSettled(supabase, winner.id);
      }
    }
    return { error: "Couldn't start generation — please try again." };
  }
  const outfitId: string = outfit.id;

  // Recorded immediately, before generation is attempted, so the item
  // selection survives a failed generation -- otherwise a failed outfit
  // retains no trace of what was being generated, making a "retry the
  // same combination" action impossible (discovered while building the
  // My Looks retry flow).
  await supabase.from("outfit_items").insert(
    rows.map((item) => ({
      outfit_id: outfitId,
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
        primaryColorHex: item.primary_color_hex ?? undefined,
        pattern: item.pattern ?? "solid",
        style: item.style ?? "casual",
        visualDetails: item.ai_analysis?.visualDetails ?? null,
      }))
    );

    const imageGen = injectedImageGen ?? getImageGenProvider();
    const generated = await imageGen.generateOutfitVisualization({
      garments,
      occasion: matchMetadata?.occasion,
      styleContext: matchMetadata?.styleContext,
    });

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
      .eq("id", outfitId);

    return { data: { outfitId, imageUrl: path } };
  } catch (err) {
    await supabase
      .from("outfits")
      .update({
        generation_status: "failed",
        generation_error: err instanceof Error ? err.message : "Generation failed.",
      })
      .eq("id", outfitId);
    return { error: "Couldn't generate your outfit visualization — please try again." };
  }
}
