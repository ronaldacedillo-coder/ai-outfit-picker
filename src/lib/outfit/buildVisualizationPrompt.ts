import type { OutfitGarmentInput } from "@/lib/providers/types";
import { OCCASION_LABELS, STYLE_CONTEXT_LABELS, type Occasion, type StyleContext } from "@/lib/validation/occasion";

// Bump whenever this file's template wording changes in a way that would
// meaningfully affect a generated image -- the outfit-generation cache
// (added in a later milestone) keys on this so a prompt improvement never
// silently serves a stale image generated under the old wording. Matches
// the existing precedent of a manually-bumped constant documenting a
// model/template version (see MODEL in src/lib/providers/gemini.ts).
export const PROMPT_VERSION = 7;

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
const CATEGORY_LOCK_RULES: { key: string; matchTokens?: string[]; mustNotBecome: string[] }[] = [
  {
    key: "full-zip jacket",
    // The AI garment analyzer produces free-text subcategories -- observed
    // in production as "zip-up jacket", not this exact display phrase.
    // Match on the essential tokens only, so the rule actually fires
    // against real analyzer output instead of just the idealized string
    // used in tests.
    matchTokens: ["zip", "jacket"],
    mustNotBecome: ["blazer", "suit jacket", "lapelled tailored jacket"],
  },
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

// Category-lock rules match on individual tokens (all must be present,
// order-independent) rather than the full display phrase used above --
// confirmed via a real generation that a rigid full-phrase match silently
// never fires against realistic AI-analyzer wording ("zip-up jacket" vs.
// the "full-zip jacket" key), which is exactly how a full-zip jacket was
// rendered as a suit jacket with no identity-lock instruction at all.
function matchesRule(garment: OutfitGarmentInput, rule: { key: string; matchTokens?: string[] }): boolean {
  const haystack = normalize(`${garment.category} ${garment.subcategory}`);
  const tokens = rule.matchTokens ?? rule.key.split(/[\s-]+/);
  return tokens.every((token) => haystack.includes(normalize(token)));
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
    const rule = CATEGORY_LOCK_RULES.find((r) => matchesRule(garment, r));
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
//
// Each garment's details are attributed to that garment by number and
// name rather than emitted as one flat undifferentiated list -- with
// multiple garments' "sleeve: X" lines sitting one after another with no
// indication of which garment each belongs to, FLUX has no way to tell
// them apart. Confirmed in production: a grey blazer (long-sleeve by
// construction) was rendered with short sleeves matching a short-sleeve
// shirt selected in the same outfit -- the two garments' sleeve lines
// were adjacent in the prompt with nothing distinguishing them.
function buildConstructionDetailLines(garments: OutfitGarmentInput[]): string[] {
  const lines: string[] = [];
  garments.forEach((garment, index) => {
    const details = garment.visualDetails;
    if (!details) return;
    const entries = Object.entries(details).filter(([key, value]) => key !== "silhouette" && value);
    if (entries.length === 0) return;
    lines.push(`Garment ${index + 1} (the ${humanize(garment.subcategory)}) construction details:`);
    for (const [key, value] of entries) {
      lines.push(`- ${humanize(key)}: ${value} -- preserve exactly for this garment only.`);
    }
  });
  return lines;
}

// Section 2b: outerwear sleeve-length lock -- tailored jackets (blazers,
// suit jackets, full-zip jackets, cardigans, etc.) are long-sleeved by
// construction; this is a garment-type invariant, not a detail that
// should depend on what any other garment in the outfit looks like.
// Stated unconditionally and independent of buildConstructionDetailLines
// above, since that section only fires when the AI analysis happened to
// capture a sleeve value -- this rule applies regardless.
function buildOuterwearSleeveLockLines(garments: OutfitGarmentInput[]): string[] {
  const lines: string[] = [];
  garments.forEach((garment, index) => {
    if (normalize(garment.category) !== "outerwear") return;
    lines.push(
      `Garment ${index + 1} (the ${humanize(garment.subcategory)}) is tailored outerwear -- it must have long sleeves reaching the wrist. Never short sleeves, cropped sleeves, or rolled-up sleeves, regardless of the sleeve length of any other garment in this outfit.`
    );
  });
  return lines;
}

function isShortSleeve(garment: OutfitGarmentInput): boolean {
  const sleeve = garment.visualDetails?.sleeve?.toLowerCase() ?? "";
  return sleeve.includes("short") || normalize(garment.subcategory).includes("shortsleeve");
}

// Section 2c: short-sleeve-under-outerwear layering consistency.
//
// A genuinely short sleeve ends above the elbow, nowhere near a jacket's
// cuff opening at the wrist. Four real generations confirmed FLUX has a
// strong, hard-to-override learned habit of rendering *some* cuff-like
// detail at a jacket's sleeve opening regardless of instructions telling
// it not to render anything there at all -- suppressing the element
// outright did not work even with increasingly forceful wording and a
// raised guidance_scale.
//
// Different strategy: instead of fighting that habit, redirect its
// color. If FLUX renders a cuff-like detail at the jacket's sleeve
// opening anyway, instructing it to color that detail to match the
// JACKET (not the shirt) means the visible result reads as a jacket
// construction detail (a sleeve tab/placket in the jacket's own fabric),
// not a shirt that's physically too short to be there -- eliminating the
// actual visible fidelity error (a mismatched-color phantom cuff) even
// if the underlying rendering habit itself isn't suppressed. The shirt
// keeps its correct color everywhere it's actually visible (collar,
// chest); only the illusory cuff area is redirected.
function buildLayeringConsistencyLines(garments: OutfitGarmentInput[]): string[] {
  const outerwear = garments.find((g) => normalize(g.category) === "outerwear");
  if (!outerwear) return [];
  const outerwearIndex = garments.indexOf(outerwear);
  const lines: string[] = [];
  garments.forEach((garment, index) => {
    if (normalize(garment.category) !== "top" || !isShortSleeve(garment)) return;
    lines.push(
      `Garment ${index + 1} (the ${humanize(garment.subcategory)}) has short sleeves ending above the elbow -- its fabric cannot physically reach the wrist. If any band, placket, trim, or cuff-like detail appears at the sleeve opening of garment ${outerwearIndex + 1} (the ${humanize(outerwear.subcategory)}), that detail must be the exact same ${outerwear.primaryColor} color and fabric as garment ${outerwearIndex + 1} itself -- never the color of garment ${index + 1}. Everywhere garment ${index + 1} is actually visible (collar, chest, torso), keep its own correct ${garment.primaryColor} color -- only right at the outerwear's cuff must garment ${index + 1}'s color never appear.`
    );
  });
  return lines;
}

// Short reinforcement of buildLayeringConsistencyLines, placed among the
// negative constraints near the end of the prompt -- mirrors the
// existing pattern of restating a high-error-rate constraint in more
// than one place (identity lock + category-substitution; the
// composition lock appears twice for the same reason).
function buildLayeringConsistencyNegativeLines(garments: OutfitGarmentInput[]): string[] {
  const outerwear = garments.find((g) => normalize(g.category) === "outerwear");
  if (!outerwear) return [];
  const outerwearIndex = garments.indexOf(outerwear);
  const lines: string[] = [];
  garments.forEach((garment, index) => {
    if (normalize(garment.category) !== "top" || !isShortSleeve(garment)) return;
    lines.push(
      `If the sleeve opening of garment ${outerwearIndex + 1} shows any cuff-like detail, it must be ${outerwear.primaryColor} to match garment ${outerwearIndex + 1} -- never garment ${index + 1}'s color.`
    );
  });
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
    const rule = CATEGORY_LOCK_RULES.find((r) => matchesRule(garment, r));
    if (!rule) continue;
    for (const alternative of rule.mustNotBecome) {
      lines.push(`Do not render this ${rule.key} as a ${alternative}.`);
    }
  }
  return lines;
}

// Leading, high-emphasis rule block -- placed first in the prompt (before
// task framing) so it governs everything that follows, at the user's
// explicit request after the narrower, later-positioned sleeve-length
// and layering-consistency instructions (sections 2b/2c) didn't fully
// suppress FLUX's own learned "shirt cuff peeking from a blazer sleeve"
// convention across multiple real test generations. Scoped to the same
// outerwear + short-sleeve-top condition as those sections -- this is a
// broad, general-purpose garment-fidelity rule, not layering-specific,
// but there's no evidence yet it's needed outside that failure mode, so
// it isn't applied unconditionally to every generation.
function buildCriticalGarmentFidelityLines(garments: OutfitGarmentInput[]): string[] {
  const hasOuterwear = garments.some((g) => normalize(g.category) === "outerwear");
  const hasShortSleeveTop = garments.some((g) => normalize(g.category) === "top" && isShortSleeve(g));
  if (!hasOuterwear || !hasShortSleeveTop) return [];

  return [
    "CRITICAL OUTFIT GENERATION RULE -- PRESERVE THE ACTUAL SELECTED GARMENTS:",
    "",
    "The selected wardrobe images are the absolute source of truth. Reproduce the exact selected garments in the generated outfit and use them only as styling components. Do NOT redesign, reinterpret, substitute, merge, simplify, embellish, shorten, lengthen, or otherwise alter any selected garment.",
    "",
    "Each selected item must remain a distinct and recognizable garment with its original:",
    "- garment category and type",
    "- silhouette and proportions",
    "- sleeve length and sleeve construction",
    "- collar and neckline",
    "- buttons, zippers, closures and fasteners",
    "- pockets and other construction details",
    "- fabric/material appearance",
    "- color and pattern",
    "- overall shape and physical characteristics",
    "",
    "Maintain correct real-world garment layering and physical relationships between garments. Outer garments must remain outer garments and inner garments must remain inner garments. Do not transfer characteristics from one garment to another.",
    "",
    "In particular, NEVER change the sleeve length of a garment because of another selected garment. A long-sleeved jacket must remain long-sleeved; a short-sleeved polo or shirt must remain short-sleeved; trousers must remain trousers; and so on. Do not invent cuffs, folds, rolled sleeves, extra layers, additional garments, or construction details that are not present in the selected items.",
    "",
    "The generated person should be wearing the actual selected garments as they would realistically be worn together by a real person. Preserve accurate garment boundaries, occlusion, proportions, fit, and layering.",
    "",
    "If a selected garment is partially hidden by another garment, preserve the visible characteristics of the original garment and do not expose portions that would not realistically be visible.",
    "",
    "PRIORITY RULE: Garment fidelity is more important than fashion interpretation, visual creativity, or aesthetic improvement. If there is any conflict between making the outfit look more fashionable and accurately preserving a selected garment, ALWAYS preserve the selected garment.",
    "",
    "Do not generate a visually similar replacement. Generate the actual selected garment.",
    "",
    "The final image should look like a professional premium menswear fashion photograph of the exact selected wardrobe items being worn together, with realistic anatomy, realistic garment construction, natural fabric behavior, and physically correct layering.",
    "",
  ];
}

export function buildVisualizationPrompt(
  garments: OutfitGarmentInput[],
  context?: { occasion?: Occasion; styleContext?: StyleContext }
): string {
  const garmentLines = garments
    .map((g) => `- ${g.primaryColor} ${humanize(g.pattern)} ${humanize(g.subcategory)}`)
    .join("\n");

  return [
    // 0. Leading critical garment-fidelity rule (only when outerwear +
    // short-sleeve top are both selected -- see buildCriticalGarmentFidelityLines)
    ...buildCriticalGarmentFidelityLines(garments),
    // 1. Task framing
    "Photorealistic professional male model wearing the exact clothing items shown in the provided reference images.",
    "",
    "The outfit consists of exactly:",
    garmentLines,
    "",
    // Output-composition lock -- the multi-image Kontext model receives
    // the reference garment photos as separate input images and, without
    // an explicit instruction otherwise, sometimes composites them into
    // the output canvas alongside the generated model (a collage/moodboard
    // layout with the individual reference photos floating around the
    // subject) instead of using them purely as fidelity references.
    // Confirmed in production: a real generation showed the model in the
    // center with all 3 reference garment photos still visible as separate
    // floating images in the four corners of the frame.
    "Output exactly one single, complete photograph containing only the model wearing the outfit.",
    "The reference images are for fidelity only -- do not include them, or any crop, thumbnail, or cutout of them, as separate visible elements anywhere in the output image.",
    "Do not create a collage, grid, side-by-side comparison, or moodboard layout.",
    "",
    // 2. Garment identity lock
    ...buildIdentityLockLines(garments),
    // 2b. Outerwear sleeve-length lock
    ...buildOuterwearSleeveLockLines(garments),
    // 2c. Short-sleeve-under-outerwear layering consistency
    ...buildLayeringConsistencyLines(garments),
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
    "Single unified photograph -- no collage, no visible reference images, no other panels or frames.",
    "",
    "The clothing is the primary visual focus.",
    "Generate only the selected garments listed above. Do not add any clothing or accessories that are not explicitly selected.",
    // 10. Garment completeness + 11. Accessory exclusion
    ...buildNegativeConstraints(garments),
    "Do not change the garment colors.",
    "Do not invent logos or patterns.",
    // 11b. Layering-consistency reinforcement
    ...buildLayeringConsistencyNegativeLines(garments),
    // 12. Category-substitution negative constraints
    ...buildCategorySubstitutionLines(garments),
  ].join("\n");
}
