import type { OutfitGarmentInput } from "@/lib/providers/types";

function humanize(text: string): string {
  return text.replace(/_/g, " ");
}

export function buildVisualizationPrompt(garments: OutfitGarmentInput[]): string {
  const garmentLines = garments
    .map((g) => `- ${g.primaryColor} ${humanize(g.pattern)} ${humanize(g.subcategory)}`)
    .join("\n");

  return [
    "Photorealistic professional male model wearing the exact clothing items shown in the provided reference images.",
    "",
    "The outfit consists of:",
    garmentLines,
    "",
    "Preserve the visual identity, color, pattern, construction, proportions, and key details of the reference garments.",
    "",
    "Professional fashion photography.",
    "Full-body or three-quarter body composition.",
    "Natural realistic human proportions.",
    "Clean neutral studio background.",
    "Soft professional lighting.",
    "Photorealistic fabric texture.",
    "Sharp clothing details.",
    "Natural posture.",
    "",
    "The clothing is the primary visual focus.",
    "Do not add accessories that are not present in the requested outfit.",
    "Do not change the garment colors.",
    "Do not invent logos or patterns.",
  ].join("\n");
}
