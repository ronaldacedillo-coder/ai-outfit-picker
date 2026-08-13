import type { OutfitGarmentInput } from "@/lib/providers/types";

function humanize(text: string): string {
  return text.replace(/_/g, " ");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s_-]+/g, "");
}

// The garment "slots" the wardrobe currently models (see clothing_categories).
// A selection fills zero or more of these; any slot left empty gets an
// explicit "do not add" line so FLUX doesn't invent an extra layer that
// wasn't selected (e.g. a jacket when only a shirt+pants were chosen).
const GARMENT_SLOTS: { role: string; label: string }[] = [
  { role: "outerwear", label: "a jacket or other outerwear" },
  { role: "top", label: "a shirt or other top" },
  { role: "bottom", label: "pants or other bottoms" },
];

// Accessories/extra layers that aren't selectable in the wardrobe yet (see
// the product spec's deferred-features list) but that a general-purpose
// image model can still invent unprompted -- confirmed in manual testing,
// which produced an uninstructed pocket square and belt. Listed by name
// here, independent of the wardrobe's category schema, specifically so
// this constraint doesn't depend on what's modeled in the database yet.
// Extend this list as new accessory types become selectable -- an item
// drops out of the "do not add" list automatically once a matching
// garment is actually selected (see isSelected below), so extending it
// never risks prohibiting something the user did select.
const KNOWN_NON_CORE_ITEMS = [
  "tie",
  "pocket square",
  "belt",
  "vest",
  "sweater",
  "scarf",
  "watch",
  "bag",
  "hat",
];

function isSelected(garments: OutfitGarmentInput[], itemName: string): boolean {
  const target = normalize(itemName);
  return garments.some((g) => {
    const category = normalize(g.category);
    const subcategory = normalize(g.subcategory);
    return category.includes(target) || subcategory.includes(target) || target.includes(subcategory);
  });
}

function buildNegativeConstraints(garments: OutfitGarmentInput[]): string[] {
  const selectedRoles = new Set(garments.map((g) => g.role));
  const lines: string[] = [];

  for (const slot of GARMENT_SLOTS) {
    if (!selectedRoles.has(slot.role)) {
      lines.push(`Do not add ${slot.label} -- none was selected.`);
    }
  }

  for (const item of KNOWN_NON_CORE_ITEMS) {
    if (!isSelected(garments, item)) {
      lines.push(`Do not add a ${item} -- it was not selected.`);
    }
  }

  return lines;
}

export function buildVisualizationPrompt(garments: OutfitGarmentInput[]): string {
  const garmentLines = garments
    .map((g) => `- ${g.primaryColor} ${humanize(g.pattern)} ${humanize(g.subcategory)}`)
    .join("\n");

  const negativeConstraints = buildNegativeConstraints(garments);

  return [
    "Photorealistic professional male model wearing the exact clothing items shown in the provided reference images.",
    "",
    "The outfit consists of exactly:",
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
    "Generate only the selected garments listed above. Do not add any clothing or accessories that are not explicitly selected.",
    ...negativeConstraints,
    "Do not change the garment colors.",
    "Do not invent logos or patterns.",
  ].join("\n");
}
