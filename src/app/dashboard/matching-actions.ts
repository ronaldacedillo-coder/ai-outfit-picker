"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/providers";
import { composeOutfitCandidates } from "@/lib/matching/outfitComposer";
import { explainCandidates, type ExplainedOutfitCandidate } from "@/lib/matching/aiStylist";
import type { AIProvider } from "@/lib/providers/types";
import type { CandidateGarment } from "@/lib/matching/types";

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
  primary_color_hex: string | null;
  pattern: string | null;
  style: string | null;
  formality_level: number | null;
  ai_analysis: { visualDetails?: Record<string, string> } | null;
  clothing_categories: { name: string } | null;
  clothing_subcategories: { name: string } | null;
}

function toCandidateGarment(row: ClothingItemQueryRow): CandidateGarment {
  return {
    id: row.id,
    role: row.clothing_categories?.name ?? "top",
    category: row.clothing_categories?.name ?? "",
    subcategory: row.clothing_subcategories?.name ?? "",
    primaryColor: row.primary_color ?? "",
    primaryColorHex: row.primary_color_hex,
    pattern: row.pattern ?? "solid",
    style: row.style ?? "casual",
    formalityLevel: row.formality_level ?? 3,
    visualDetails: row.ai_analysis?.visualDetails ?? null,
    imagePath: row.image_url,
  };
}

export async function findMatchingOutfits(
  selectedItemId: string,
  injectedClient?: SupabaseClient,
  injectedAI?: AIProvider
): Promise<ActionResult<{ candidates: ExplainedOutfitCandidate[] }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const { data: rows, error } = await supabase
    .from("clothing_items")
    .select(
      "id, image_url, primary_color, primary_color_hex, pattern, style, formality_level, ai_analysis, clothing_categories(name), clothing_subcategories(name)"
    )
    .eq("user_id", user.id);

  if (error || !rows) return { error: "Couldn't load your wardrobe — please try again." };

  const wardrobe = (rows as unknown as ClothingItemQueryRow[]).map(toCandidateGarment);
  const selected = wardrobe.find((g) => g.id === selectedItemId);
  if (!selected) return { error: "That item couldn't be found in your wardrobe." };

  const rawCandidates = composeOutfitCandidates(selected, wardrobe);

  let ai: AIProvider | undefined = injectedAI;
  if (ai === undefined) {
    try {
      ai = getAIProvider();
    } catch {
      ai = undefined; // Gemini not configured -- deterministic recommendations still work.
    }
  }

  const candidates = await explainCandidates(rawCandidates, ai);
  return { data: { candidates } };
}
