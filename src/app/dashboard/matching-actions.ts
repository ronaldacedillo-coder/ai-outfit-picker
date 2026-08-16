"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/providers";
import { getOutfitRecommendations, type RecommendedOutfitCandidate } from "@/lib/matching/getOutfitRecommendations";
import type { ExplainedOutfitCandidate } from "@/lib/matching/aiStylist";
import type { AIProvider } from "@/lib/providers/types";
import { requireUser } from "@/lib/auth/requireUser";
import { occasionEnum, styleContextEnum, type Occasion, type StyleContext } from "@/lib/validation/occasion";

type ActionResult<T> = { data: T } | { error: string };

function resolveAI(injectedAI: AIProvider | undefined): AIProvider | undefined {
  if (injectedAI !== undefined) return injectedAI;
  try {
    return getAIProvider();
  } catch {
    return undefined; // Gemini not configured -- deterministic recommendations still work.
  }
}

// Kept for backward compatibility with existing callers (the outfit-picker
// UI's default, non-occasion-aware flow, and its existing test coverage):
// a thin wrapper over getOutfitRecommendations with no occasion/style
// context, and the admin_override/ai/fallback source tag stripped since
// callers of this specific function have never needed it.
export async function findMatchingOutfits(
  selectedItemId: string,
  injectedClient?: SupabaseClient,
  injectedAI?: AIProvider
): Promise<ActionResult<{ candidates: ExplainedOutfitCandidate[] }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const result = await getOutfitRecommendations({ selectedItemId }, supabase, resolveAI(injectedAI));
  if ("error" in result) return result;

  const candidates: ExplainedOutfitCandidate[] = result.data.candidates.map((c) => ({
    garments: c.garments,
    score: c.score,
    scoreBreakdown: c.scoreBreakdown,
    explanation: c.explanation,
    conflicts: c.conflicts,
  }));
  return { data: { candidates } };
}

// The occasion/style-context-aware entry point: surfaces ARROW STYLE PICK
// (admin_override) results ahead of AI STYLE RECOMMENDATION (ai) or
// unbranded deterministic (fallback) ones -- see source on each candidate.
export async function getOutfitRecommendationsAction(
  selectedItemId: string,
  occasion?: string,
  styleContext?: string,
  injectedClient?: SupabaseClient,
  injectedAI?: AIProvider
): Promise<ActionResult<{ candidates: RecommendedOutfitCandidate[] }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const parsedOccasion = occasion ? occasionEnum.safeParse(occasion) : undefined;
  const parsedStyleContext = styleContext ? styleContextEnum.safeParse(styleContext) : undefined;
  if (parsedOccasion && !parsedOccasion.success) return { error: "Unrecognized occasion." };
  if (parsedStyleContext && !parsedStyleContext.success) return { error: "Unrecognized style context." };

  const occasionValue: Occasion | undefined = parsedOccasion?.success ? parsedOccasion.data : undefined;
  const styleContextValue: StyleContext | undefined = parsedStyleContext?.success ? parsedStyleContext.data : undefined;

  return getOutfitRecommendations(
    { selectedItemId, occasion: occasionValue, styleContext: styleContextValue },
    supabase,
    resolveAI(injectedAI)
  );
}
