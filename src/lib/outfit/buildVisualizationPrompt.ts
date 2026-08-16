import type { OutfitGarmentInput } from "@/lib/providers/types";
import { OCCASION_LABELS, STYLE_CONTEXT_LABELS, type Occasion, type StyleContext } from "@/lib/validation/occasion";

// Bump whenever this file's template wording changes in a way that would
// meaningfully affect a generated image -- the outfit-generation cache
// (added in a later milestone) keys on this so a prompt improvement never
// silently serves a stale image generated under the old wording. Matches
// the existing precedent of a manually-bumped constant documenting a
// model/template version (see MODEL in src/lib/providers/gemini.ts).
export const PROMPT_VERSION = 2;

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

// Named category-confusion failure modes observed in generation testing:
// FLUX would sometimes reinterpret a selected garment as a visually
// similar but distinct garment type (e.g. a full-zip jacket rendered as a
// lapelled blazer). Each entry is matched fuzzily (see matchesCategory)
// against a garment's category/subcategory, so it applies regardless of
// the exact spelling stored in clothing_subcategories.
const CATEGORY_LOCK_RULES: { key: string; mustNotBecome: string[] }[] = [
  { key: "full-zip jacket", mustNotBecome: ["blazer", "suit jacket", "lapelled tailored jacket"] },
  { key: "blazer", mustNotBecome: ["suit jacket", "sport coat with peak lapels"] },
  { key: "dress shirt", mustNotBecome: ["polo shirt", "polo"] },
  { key: "polo shirt", mustNotBecome: ["t-shirt", "crew neck shirt"] },
  { key: "chinos", mustNotBecome: ["suit trousers", "dress trousers"] },
  { key: "suit trousers", mustNotBecome: ["jeans", "denim"] },
  { key: "cardigan", mustNotBecome: ["jacket", "blazer"] },
];

function matchesCategory(garment: OutfitGarmentInput, key: string): boolean {
  const target = normalize(key);
  const category = normalize(garment.category);
  const subcategory = normalize(garment.subcategory);
  return category.includes(target) || subcategory.includes(target) || target.includes(subcategory);
}

function isSelected(garments: OutfitGarmentInput[], itemName: string): boolean {
  return garments.some((g) => matchesCategory(g, itemName));
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

// Section 2: garment identity lock -- one positive "this must remain X"
// line per garment that matches a known category-confusion rule.
function buildIdentityLockLines(garments: OutfitGarmentInput[]): string[] {
  const lines: string[] = [];
  garments.forEach((garment, index) => {
    const rule = CATEGORY_LOCK_RULES.find((r) => matchesCategory(garment, r.key));
    if (!rule) return;
    const alternatives = rule.mustNotBecome.join(", ");
    lines.push(
      `Garment ${index + 1} is a ${rule.key}. It must remain a ${rule.key} -- do not turn it into a ${alternatives}.`
    );
  });
  return lines;
}

// Section 3: closure/collar/construction details -- surfaces whatever the
// AI analysis captured in visualDetails (collar, lapel, sleeve, closure,
// etc.) as explicit preserve-exactly instructions, per garment.
function buildConstructionDetailLines(garments: OutfitGarmentInput[]): string[] {
  const lines: string[] = [];
  for (const garment of garments) {
    const details = garment.visualDetails;
    if (!details) continue;
    for (const [key, value] of Object.entries(details)) {
      if (key === "silhouette" || !value) continue; // silhouette is handled in its own section
      lines.push(`${humanize(key)}: ${value} -- preserve exactly.`);
    }
  }
  return lines;
}

// Section 4: color fidelity -- the hex-anchored line supplements (never
// replaces) the always-present generic "do not change the garment
// colors" instruction below, since hex data isn't guaranteed to exist for
// every garment.
function buildColorFidelityLines(garments: OutfitGarmentInput[]): string[] {
  const lines: string[] = [];
  for (const garment of garments) {
    if (!garment.primaryColorHex) continue;
    lines.push(
      `Primary color: ${garment.primaryColor} (${garment.primaryColorHex}) -- match this exact hue and saturation, do not shift lighter, darker, or toward a different hue.`
    );
  }
  return lines;
}

// Section 5: pattern fidelity -- only meaningful for non-solid patterns;
// a "preserve the solid color" instruction is already covered by color
// fidelity, so a solid garment doesn't need a separate pattern line.
function buildPatternFidelityLines(garments: OutfitGarmentInput[]): string[] {
  const lines: string[] = [];
  for (const garment of garments) {
    if (!garment.pattern || garment.pattern === "solid") continue;
    lines.push(
      `Pattern: ${humanize(garment.pattern)} -- preserve the pattern's scale, spacing, and direction exactly as shown. Do not substitute a different pattern, plaid, or texture.`
    );
  }
  return lines;
}

// Section 6: silhouette/fit -- a generic instruction always applies; a
// more specific one is added per garment when the AI analysis captured a
// silhouette description.
function buildSilhouetteLines(garments: OutfitGarmentInput[]): string[] {
  const lines: string[] = [
    "Preserve each garment's fit and proportions exactly as shown in the reference photos -- do not slim, loosen, lengthen, shorten, or otherwise resize them.",
  ];
  for (const garment of garments) {
    const silhouette = garment.visualDetails?.silhouette;
    if (silhouette) {
      lines.push(`Silhouette: ${silhouette} -- preserve exactly.`);
    }
  }
  return lines;
}

// Section 8: occasion/style-context direction -- deliberately scoped to
// pose and setting only. The trailing guard sentence exists because,
// without it, a model can misinterpret an occasion label (e.g. "Office")
// as license to add or substitute a garment (e.g. a blazer) rather than
// just adjusting pose/setting.
function buildOccasionContextLines(context?: { occasion?: Occasion; styleContext?: StyleContext }): string[] {
  if (!context?.occasion && !context?.styleContext) return [];
  const parts = [
    context.occasion ? OCCASION_LABELS[context.occasion] : null,
    context.styleContext ? STYLE_CONTEXT_LABELS[context.styleContext] : null,
  ].filter(Boolean);
  return [
    `Styling context: ${parts.join(", ")} -- professional studio setting, natural confident posture appropriate for this context.`,
    "This context must never change any garment's category, color, or pattern -- it informs pose and setting only.",
  ];
}

// Section 12: category-substitution negative constraints -- the negative
// companion to the positive identity-lock lines in section 2, phrased as
// explicit "do not render as" instructions.
function buildCategorySubstitutionLines(garments: OutfitGarmentInput[]): string[] {
  const lines: string[] = [];
  for (const garment of garments) {
    const rule = CATEGORY_LOCK_RULES.find((r) => matchesCategory(garment, r.key));
    if (!rule) continue;
    for (const alternative of rule.mustNotBecome) {
      lines.push(`Do not render this ${rule.key} as a ${alternative}.`);
    }
  }
  return lines;
}

export function buildVisualizationPrompt(
  garments: OutfitGarmentInput[],
  context?: { occasion?: Occasion; styleContext?: StyleContext }
): string {
  const garmentLines = garments
    .map((g) => `- ${g.primaryColor} ${humanize(g.pattern)} ${humanize(g.subcategory)}`)
    .join("\n");

  return [
    // 1. Task framing
    "Photorealistic professional male model wearing the exact clothing items shown in the provided reference images.",
    "",
    "The outfit consists of exactly:",
    garmentLines,
    "",
    // 2. Garment identity lock
    ...buildIdentityLockLines(garments),
    // 3. Closure / collar / construction details
    ...buildConstructionDetailLines(garments),
    // 4. Color fidelity
    ...buildColorFidelityLines(garments),
    // 5. Pattern fidelity
    ...buildPatternFidelityLines(garments),
    // 6. Silhouette / fit
    ...buildSilhouetteLines(garments),
    "",
    // 7. General non-negotiables
    "Preserve the visual identity, color, pattern, construction, proportions, and key details of the reference garments.",
    "",
    // 8. Occasion / style-context direction
    ...buildOccasionContextLines(context),
    "",
    // 9. Composition / photography direction
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
    // 10. Garment completeness + 11. Accessory exclusion
    ...buildNegativeConstraints(garments),
    "Do not change the garment colors.",
    "Do not invent logos or patterns.",
    // 12. Category-substitution negative constraints
    ...buildCategorySubstitutionLines(garments),
  ].join("\n");
}
