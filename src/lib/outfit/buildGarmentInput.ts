import type { OutfitGarmentInput } from "@/lib/providers/types";

interface ClothingItemForGarmentInput {
  primary_color: string | null;
  primary_color_hex: string | null;
  pattern: string | null;
  style: string | null;
  ai_analysis: { subcategory?: string; visualDetails?: Record<string, string> } | null;
  clothing_categories: { name: string } | null;
  clothing_subcategories: { name: string } | null;
}

// Prefer the AI analyzer's own per-item subcategory text over the shared
// DB subcategory row's name. The wardrobe schema currently has only one
// DB subcategory per broad category (every outerwear item is filed under
// "business_jacket" regardless of whether it's actually a blazer or a
// full-zip jacket), so using the DB name here fed
// buildVisualizationPrompt the wrong garment description and silently
// defeated its category-lock rules for anything that wasn't literally a
// business jacket -- confirmed via a real generation where a "zip-up
// jacket" item rendered as a suit jacket because the prompt described it
// as a "business jacket" with no identity-lock line at all.
export function buildGarmentFields(item: ClothingItemForGarmentInput): Omit<OutfitGarmentInput, "imageUrl"> {
  return {
    role: item.clothing_categories?.name ?? "top",
    category: item.clothing_categories?.name ?? "",
    subcategory: item.ai_analysis?.subcategory ?? item.clothing_subcategories?.name ?? "",
    primaryColor: item.primary_color ?? "",
    primaryColorHex: item.primary_color_hex ?? undefined,
    pattern: item.pattern ?? "solid",
    style: item.style ?? "casual",
    visualDetails: item.ai_analysis?.visualDetails ?? null,
  };
}
