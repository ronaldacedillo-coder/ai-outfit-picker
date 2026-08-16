import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider } from "@/lib/providers/types";
import type { CandidateGarment } from "./types";
import { composeOutfitCandidates } from "./outfitComposer";
import { explainCandidates, type ExplainedOutfitCandidate } from "./aiStylist";
import { pickBestMatchingRule, type ResolvedOverrideRule } from "./matchingOverrides";

export type RecommendationSource = "admin_override" | "ai" | "fallback";

export interface RecommendedOutfitCandidate extends ExplainedOutfitCandidate {
  source: RecommendationSource;
  overrideRuleId?: string;
}

type ActionResult<T> = { data: T } | { error: string };

interface ClothingItemQueryRow {
  id: string;
  image_url: string;
  primary_color: string | null;
  primary_color_hex: string | null;
  pattern: string | null;
  style: string | null;
  formality_level: number | null;
  ai_analysis: { visualDetails?: Record<string, string> } | null;
  category_id: number;
  subcategory_id: number;
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

interface RawOverrideRow {
  id: string;
  base_item_id: string | null;
  matched_item_id: string | null;
  matched_category_id: number | null;
  matched_subcategory_id: number | null;
  occasion: string | null;
  style_context: string | null;
  priority: number;
}

// Wraps, never replaces, the existing deterministic + AI-assisted matching
// engine (composeOutfitCandidates / explainCandidates): every candidate
// this returns went through the same real structural-validity and scoring
// logic as before. An admin override never fabricates a score or a
// structurally invalid combination -- it only relabels an already-valid,
// already-scored candidate as the one to surface first, by checking
// whether that candidate happens to contain a rule's matched garment.
export async function getOutfitRecommendations(
  params: { selectedItemId: string; occasion?: string; styleContext?: string },
  supabase: SupabaseClient,
  ai: AIProvider | undefined
): Promise<ActionResult<{ candidates: RecommendedOutfitCandidate[] }>> {
  const { data: rows, error } = await supabase
    .from("clothing_items")
    .select(
      "id, image_url, primary_color, primary_color_hex, pattern, style, formality_level, ai_analysis, category_id, subcategory_id, clothing_categories(name), clothing_subcategories(name)"
    );
  if (error || !rows) return { error: "Couldn't load the catalog — please try again." };

  const queryRows = rows as unknown as ClothingItemQueryRow[];
  const wardrobe = queryRows.map(toCandidateGarment);
  const metaById = new Map(queryRows.map((r) => [r.id, { categoryId: r.category_id, subcategoryId: r.subcategory_id }]));

  const selected = wardrobe.find((g) => g.id === params.selectedItemId);
  if (!selected) return { error: "That item couldn't be found in the catalog." };
  const selectedMeta = metaById.get(selected.id);

  const rawCandidates = composeOutfitCandidates(selected, wardrobe);
  const explained = await explainCandidates(rawCandidates, ai);

  // security definer RPC (migration 0008): resolves applicable rules for
  // every role, including STORE/CUSTOMER, who have no direct SELECT
  // policy on matching_overrides itself.
  const { data: overrideRows } = await supabase.rpc("get_applicable_overrides", {
    p_item_id: selected.id,
    p_category_id: selectedMeta?.categoryId ?? null,
    p_subcategory_id: selectedMeta?.subcategoryId ?? null,
    p_occasion: params.occasion ?? null,
    p_style_context: params.styleContext ?? null,
  });

  const resolvedRules: ResolvedOverrideRule[] = ((overrideRows ?? []) as RawOverrideRow[]).map((row) => {
    const matchedGarmentIds: string[] = row.matched_item_id
      ? [row.matched_item_id]
      : wardrobe
          .filter((g) => {
            const meta = metaById.get(g.id);
            return (
              meta?.categoryId === row.matched_category_id && meta?.subcategoryId === row.matched_subcategory_id
            );
          })
          .map((g) => g.id);
    return {
      ruleId: row.id,
      matchedGarmentIds,
      priority: row.priority,
      isItemLevel: row.base_item_id !== null,
      hasExactContext: row.occasion !== null && row.style_context !== null,
    };
  });

  const tagged: RecommendedOutfitCandidate[] = explained.map((candidate) => {
    const garmentIds = candidate.garments.map((g) => g.id);
    const rule = resolvedRules.length > 0 ? pickBestMatchingRule(garmentIds, resolvedRules) : null;
    if (rule) {
      return { ...candidate, source: "admin_override", overrideRuleId: rule.ruleId };
    }
    return { ...candidate, source: ai !== undefined ? "ai" : "fallback" };
  });

  // Admin-curated combinations always surface first; everything else
  // keeps composeOutfitCandidates' existing score-descending order.
  const overridePicks = tagged.filter((c) => c.source === "admin_override");
  const rest = tagged.filter((c) => c.source !== "admin_override");

  return { data: { candidates: [...overridePicks, ...rest] } };
}
