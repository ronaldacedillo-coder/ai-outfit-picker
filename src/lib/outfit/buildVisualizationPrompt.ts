import type { OutfitGarmentInput } from "@/lib/providers/types";
import { OCCASION_LABELS, STYLE_CONTEXT_LABELS, type Occasion, type StyleContext } from "@/lib/validation/occasion";

// Bump whenever this file's template wording changes in a way that would
// meaningfully affect a generated image -- the outfit-generation cache
// (added in a later milestone) keys on this so a prompt improvement never
// silently serves a stale image generated under the old wording. Matches
// the existing precedent of a manually-bumped constant documenting a
// model/template version (see MODEL in src/lib/providers/gemini.ts).
export const PROMPT_VERSION = 16;

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
//
// "belt" deliberately does NOT appear here -- unlike these other
// accessories, a belt is standard, expected menswear whenever pants/
// trousers are worn, and its absence read as an unstyled gap rather than
// a fidelity error. See buildBeltLines below for the positive instruction
// that replaces this negative one.
const KNOWN_NON_CORE_ITEMS = ["tie", "pocket square", "vest", "sweater", "scarf", "watch", "bag", "hat"];

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

// Section 6b: belt styling -- a belt is standard menswear whenever
// pants/trousers are worn, and its color/formality should read as
// deliberately coordinated with the rest of the outfit rather than
// left to the model's own defaults. Only added when a bottom garment is
// actually selected -- a belt with no visible waistband to sit on
// doesn't make sense. Colors follow the classic dress-menswear rule
// (black leather for cool/neutral tones, brown leather for warm tones);
// formality follows the most formal garment.style present, since a
// business-formal outfit calls for a slim dress belt while a casual one
// calls for a more relaxed one.
const WARM_BELT_COLOR_TOKENS = ["brown", "tan", "khaki", "beige", "olive", "camel", "rust", "cognac"];
const FORMAL_STYLES = new Set(["business_formal", "business_casual"]);

function beltColorFor(garments: OutfitGarmentInput[]): "brown" | "black" {
  const bottom = garments.find((g) => normalize(g.category) === "bottom");
  const reference = bottom ?? garments.find((g) => normalize(g.category) === "outerwear") ?? garments[0];
  const color = (reference?.primaryColor ?? "").toLowerCase();
  return WARM_BELT_COLOR_TOKENS.some((token) => color.includes(token)) ? "brown" : "black";
}

function buildBeltLines(garments: OutfitGarmentInput[]): string[] {
  const hasBottom = garments.some((g) => normalize(g.category) === "bottom");
  if (!hasBottom) return [];

  const beltColor = beltColorFor(garments);
  const isFormal = garments.some((g) => FORMAL_STYLES.has(g.style));
  const beltDescription = isFormal
    ? `a slim ${beltColor} leather dress belt with a simple, understated buckle`
    : `a ${beltColor} leather belt with a simple buckle`;

  const lines = [
    `Add ${beltDescription} at the waistline, worn through the belt loops of the pants/trousers, coordinated with the outfit's overall color palette and formality.`,
    "The belt should read as a natural, appropriate finishing accessory -- not a focal point -- and must not clash with or distract from the primary selected garments.",
    // Confirmed via a real generation: without this explicit framing
    // requirement, the model sometimes crops the shot at the hip/waist,
    // which hides the belt entirely even when the belt instruction above
    // is otherwise followed correctly.
    "The composition must frame far enough down to clearly show the waistline and belt -- do not crop the shot at or above the waist.",
  ];

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

// Single-line, all-caps headline -- placed as the literal first characters
// of the entire prompt, ahead of even the composition lock below. Added
// after repeated real generations kept rendering a selected jacket fully
// zipped/buttoned closed despite three separate, detailed CRITICAL blocks
// already addressing this from different angles (garment fidelity,
// layering visibility, belt visibility) -- each of those blocks states the
// open-front requirement, but each does so as one instruction embedded
// several paragraphs into a longer block, competing with everything else
// in an increasingly long prompt for the model's attention. This is
// deliberately the opposite kind of fix from those blocks: not more
// explanation, but the shortest, plainest, most front-loaded possible
// statement of the one requirement that keeps failing, on the theory that
// instruction position and brevity matter for compliance independent of
// how thoroughly a requirement is explained elsewhere. Kept intentionally
// terse -- the detailed reasoning and self-verification steps still live
// in the blocks below; this line's only job is maximum salience.
function buildTopLineOpenJacketReminder(garments: OutfitGarmentInput[]): string[] {
  const hasOuterwear = garments.some((g) => normalize(g.category) === "outerwear");
  if (!hasOuterwear) return [];
  return ["JACKET MUST BE WORN FULLY OPEN AND UNZIPPED/UNBUTTONED -- NEVER RENDER IT CLOSED.", ""];
}

// Leading, unconditional composition-lock rule -- placed first in the
// prompt (even before the critical garment-fidelity block) because a
// real generation showed the multi-image Kontext model compositing the
// output as a moodboard: the main model photo in the center plus a
// separate small inset photo of a person wearing just one reference
// garment, plus a separate floating cutout of another reference garment
// with no person at all, in the same output image. The existing
// mid-prompt "single photograph" instructions (see the output-composition
// lock in buildVisualizationPrompt and section 9 below) did not fully
// suppress this -- unlike the sleeve-fidelity failure mode, this isn't
// scoped to any particular garment combination, so unlike
// buildCriticalGarmentFidelityLines below, this rule always applies.
function buildCriticalCompositionLines(): string[] {
  return [
    "CRITICAL COMPOSITION RULE -- ONE PHOTO, ONE PERSON, NOTHING ELSE:",
    "",
    "The output must be exactly one single photograph containing exactly one person: the model wearing the complete outfit. Nothing else may appear anywhere in the frame.",
    "",
    "Do not include any additional inset photo, thumbnail, insert, corner panel, or secondary image of a person -- not the model, not anyone else, not wearing part of the outfit, not wearing anything else.",
    "Do not include any floating, cut-out, or isolated product photo of a garment by itself -- every garment must be shown only as worn by the one model in the single main photograph, never as a separate still-life or flat-lay element anywhere in the frame.",
    "Do not create a collage, grid, moodboard, split-screen, side-by-side comparison, or any layout with more than one photograph, panel, or frame.",
    "The reference garment images provided are for fidelity only -- study them to reproduce the garments accurately, but never reproduce the reference photos themselves, or any crop, thumbnail, cutout, or copy of them, as visible content in the output.",
    "Before finishing, verify the output contains only the single full photograph of the one model -- remove any other visual element that is not part of that one photograph.",
    "",
  ];
}

// Leading, unconditional framing rule -- placed right after the
// composition lock because a real generation showed the model producing
// a headless, ghost-mannequin/product-photo-style crop: the frame started
// right at the collar/shoulder line with no head, hair, or face visible
// at all, just the garments as if worn by an invisible person. The
// existing mid-prompt framing instruction (see section 9 below) only
// specifies the *bottom* extent of the crop ("at least mid-thigh") and
// never actually says the head must be included -- so a model that reads
// "clothing is the primary visual focus" too literally has nothing
// telling it the head can't be cropped away entirely. Always applies,
// like the composition lock above, since this isn't scoped to any
// particular garment combination.
function buildCriticalPersonFramingLines(): string[] {
  return [
    "CRITICAL FRAMING RULE -- THE MODEL'S HEAD AND FACE MUST BE VISIBLE:",
    "",
    "This is a photograph of a real human model wearing the outfit -- not a product photo, ghost-mannequin shot, flat lay, or headless torso crop. The model's head, hair, and face must be fully visible in the frame, exactly as they would be in any normal photograph of a person.",
    "",
    "Frame the shot from the top of the model's head down to at least mid-thigh. Do not crop, cut off, or exclude the model's head or face for any reason, including to emphasize garment detail -- garment fidelity never justifies removing the person from the photograph.",
    "",
    "Before finishing, verify the model's head and face are both visible in the generated image. If the frame starts at the shoulders, neck, or collar with no head above it, the image is wrong.",
    "",
  ];
}

// Leading, unconditional pose rule -- a real generation kept posing the
// model actively gripping both jacket lapels with his hands and pulling
// them open (thumbs hooked into the front panels), rather than just
// wearing the jacket open normally. This exact instruction already
// existed as a paragraph embedded inside buildCriticalLayeringVisibilityLines
// below, but a follow-up real generation showed the pose recurring even
// with that paragraph in place -- an instruction buried as one paragraph
// among several inside a block titled after a different concern (shirt
// visibility) evidently isn't carrying enough weight on its own. Promoted
// to its own dedicated leading block with its own heading, exactly the
// same escalation this file has used before (see the belt-visibility
// promotion above) when embedding an instruction inside a broader block
// wasn't sufficient. Scoped to outerwear alone (not outerwear+top) since
// the failure is about how the jacket itself is worn/posed, independent
// of what's underneath it, and per outfitComposer.ts outerwear is never
// actually selected without a top anyway.
function buildCriticalNaturalPoseLines(garments: OutfitGarmentInput[]): string[] {
  const hasOuterwear = garments.some((g) => normalize(g.category) === "outerwear");
  if (!hasOuterwear) return [];

  return [
    "CRITICAL POSE RULE -- THE MODEL MUST STAND NATURALLY, NOT HOLDING THE JACKET:",
    "",
    "The model must stand in a normal, relaxed, natural standing pose, facing the camera, with his arms and hands relaxed at his sides (or in a similarly natural resting position such as loosely in his pockets).",
    "",
    "The outerwear being open at the front is a passive, static state of the garment -- it hangs open on its own because it is unzipped or unbuttoned, exactly as it would if a person simply left it that way and did nothing else. It is NOT a pose or an action the model is performing.",
    "",
    "Do not pose the model gripping, holding, pulling open, spreading apart, hooking his thumbs into, or otherwise touching or interacting with the jacket, its lapels, its front panels, or its zipper with his hands. His hands and arms must have no contact with the jacket at all -- they belong at his sides or in a natural resting position, not raised toward his chest or collar.",
    "",
    "Before finishing, verify the model's hands are not touching, gripping, or holding any part of the jacket in the generated image. If his hands are on the jacket in any way, the image is wrong -- regenerate the pose so his arms rest naturally at his sides instead.",
    "",
  ];
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

// Leading, high-emphasis rule block for the outerwear+top case: a real
// generation showed a selected short-sleeve shirt worn under a jacket
// rendered fully zipped/buttoned closed, hiding the shirt entirely --
// the reference-fidelity instructions elsewhere in the prompt (preserve
// this exact garment, don't alter it) say nothing about the jacket's own
// open/closed state, so nothing was actually telling FLUX the jacket
// needed to stay open for the shirt underneath to be visible at all.
//
// Deliberately scoped to outerwear+top only -- not outerwear+top+bottom
// like buildCriticalBeltVisibilityLines below -- so it also fires for a
// jacket-over-shirt combination with no bottom/belt in play, which the
// belt-visibility block never covers since it requires a bottom too.
// Where both blocks fire together (the common case: shirt + jacket +
// pants), they reinforce the same "worn open" requirement from two
// independent angles (shirt visibility, belt visibility) rather than
// conflicting -- matching this file's established pattern of restating a
// high-error-rate constraint in more than one place (see the composition
// lock and the belt visibility block itself).
//
// A later real generation (after this block already existed) showed the
// model complying with "open, front panels separated" in an unintended
// way: rather than letting the jacket hang open naturally, it posed the
// model actively gripping both lapels and pulling the jacket open with
// his hands, like a jacket-reveal gesture. Nothing in this block said the
// open front had to be a *passive, natural* state rather than an active
// pose, so the generic "Natural posture." line elsewhere in the prompt
// (too weak/unspecific on its own, same failure category as every other
// instruction promoted to a CRITICAL block in this file) lost out to the
// much more detailed open-front instructions here. Addressed directly in
// this same block rather than a new one, since it's the same instruction
// causing the side effect.
function buildCriticalLayeringVisibilityLines(garments: OutfitGarmentInput[]): string[] {
  const outerwear = garments.find((g) => normalize(g.category) === "outerwear");
  const tops = garments.filter((g) => normalize(g.category) === "top");
  if (!outerwear || tops.length === 0) return [];

  const outerwearIndex = garments.indexOf(outerwear);
  const topDescriptions = tops
    .map((t) => `the ${t.primaryColor} ${humanize(t.subcategory)}`)
    .join(" and ");

  return [
    "CRITICAL LAYERING VISIBILITY RULE -- THE JACKET MUST BE OPEN SO THE SHIRT UNDERNEATH IS VISIBLE:",
    "",
    `This outfit layers garment ${outerwearIndex + 1} (the ${humanize(outerwear.subcategory)}) over ${topDescriptions}. The whole point of selecting both garments is that both are visible in the result -- a jacket rendered fully zipped, buttoned, or otherwise closed hides the shirt underneath and defeats the purpose of the selection. This is exactly as important as preserving either garment's own identity, color, or construction.`,
    "",
    `Garment ${outerwearIndex + 1} must be worn open at the front: unzipped if it closes with a zipper, unbuttoned if it closes with buttons, with the two front panels separated. Do not render it zipped up, buttoned closed, or fastened in any way.`,
    "",
    `The open front must clearly reveal ${topDescriptions} underneath -- its collar, chest, and front placket must be visible in the gap between the jacket's open front panels, not obscured by the jacket.`,
    "",
    "The jacket must hang open naturally on its own, as it would if simply left unzipped or unbuttoned -- this is a passive, static state of the garment, not a pose or action. The model must stand in a normal, relaxed, natural standing posture with his arms and hands relaxed at his sides (or in a similarly natural resting position). Do not have the model grip, hold, pull open, spread apart, or otherwise touch the jacket's lapels or front panels with his hands -- his hands must not be interacting with the jacket at all.",
    "",
    "Before finishing, verify two things in the generated image: (1) the shirt or top underneath is actually visible through the jacket's open front, and (2) the model is standing naturally with his hands not touching or holding the jacket open. If either is wrong -- the jacket appears closed, or the model is gripping/holding the jacket open with his hands -- the image is wrong.",
    "",
  ];
}

// Leading, high-emphasis rule block for the outerwear+bottom case,
// promoted here after the mid-prompt belt-visibility instructions in
// buildBeltLines proved unreliable across multiple real generations even
// after fixing three distinct, genuine causes one at a time (closed
// jacket, then a buckle not landing in the open gap, then an untucked
// shirt hem). Two further real generations with all three fixes present
// together still showed no belt at all -- not misplaced, just absent --
// suggesting the instruction was losing out to the strong,
// reference-image-fidelity pressure elsewhere in the prompt rather than
// being followed and then physically occluded. The exact same promotion
// (regular instruction -> leading CRITICAL block) is what fixed the
// composition/collage-leak issue earlier in this file when a mid-prompt
// instruction alone wasn't enough; applying the same fix here rather than
// inventing a new strategy.
function buildCriticalBeltVisibilityLines(garments: OutfitGarmentInput[]): string[] {
  const hasBottom = garments.some((g) => normalize(g.category) === "bottom");
  const hasOuterwear = garments.some((g) => normalize(g.category) === "outerwear");
  if (!hasBottom || !hasOuterwear) return [];

  const beltColor = beltColorFor(garments);
  const isFormal = garments.some((g) => FORMAL_STYLES.has(g.style));
  const beltDescription = isFormal
    ? `a slim ${beltColor} leather dress belt with a simple, understated buckle`
    : `a ${beltColor} leather belt with a simple buckle`;

  return [
    "CRITICAL BELT VISIBILITY RULE -- THE BELT MUST BE PRESENT AND VISIBLE:",
    "",
    `This outfit includes both outerwear and pants/trousers. Add ${beltDescription} at the waistline, worn through the belt loops -- this is a REQUIRED garment for this outfit, exactly as required as the selected garments themselves, not an optional accessory that can be silently dropped in favor of fidelity to the reference photos.`,
    "",
    "To keep the belt visible, all of the following are required at once:",
    "- The outerwear must be worn open and unbuttoned at the front. A buttoned-closed jacket hides the belt entirely and is not acceptable.",
    "- Any top or shirt worn underneath must be tucked into the pants/trousers. An untucked hem hanging over the waistband hides the belt just as much as a closed jacket does, and is not acceptable.",
    "- The belt buckle must be positioned at the center front of the waistline, in the visible gap between the open jacket's two front panels, at the same height as the waistband.",
    "",
    "Before finishing, verify the belt and its buckle are actually visible in the generated image at the waistline. If the jacket, an untucked shirt, or anything else is covering the belt, the image is wrong -- the belt must be seen, not merely present underneath other garments.",
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
    // -2. Single-line, all-caps headline reminder (only when outerwear is
    // selected -- see buildTopLineOpenJacketReminder). Deliberately the
    // very first thing in the prompt, ahead of even the composition lock.
    ...buildTopLineOpenJacketReminder(garments),
    // -1. Leading critical composition-lock rule (unconditional, every
    // generation -- see buildCriticalCompositionLines)
    ...buildCriticalCompositionLines(),
    // -0.5. Leading critical person-framing rule (unconditional, every
    // generation -- see buildCriticalPersonFramingLines)
    ...buildCriticalPersonFramingLines(),
    // -0.25. Leading critical natural-pose rule (only when outerwear is
    // selected -- see buildCriticalNaturalPoseLines)
    ...buildCriticalNaturalPoseLines(garments),
    // 0. Leading critical garment-fidelity rule (only when outerwear +
    // short-sleeve top are both selected -- see buildCriticalGarmentFidelityLines)
    ...buildCriticalGarmentFidelityLines(garments),
    // 0a. Leading critical layering-visibility rule (only when outerwear +
    // any top are both selected -- see buildCriticalLayeringVisibilityLines)
    ...buildCriticalLayeringVisibilityLines(garments),
    // 0b. Leading critical belt-visibility rule (only when outerwear +
    // bottom are both selected -- see buildCriticalBeltVisibilityLines)
    ...buildCriticalBeltVisibilityLines(garments),
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
    // 6b. Belt styling
    ...buildBeltLines(garments),
    "",
    // 7. General non-negotiables
    "Preserve the visual identity, color, pattern, construction, proportions, and key details of the reference garments.",
    "",
    // 8. Occasion / style-context direction
    ...buildOccasionContextLines(context),
    "",
    // 9. Composition / photography direction
    "Professional fashion photography.",
    // Confirmed via real generations: "full-body or three-quarter body"
    // alone was still interpreted as a tight chest-up/waist-up crop,
    // which cuts off the waistline before the belt (see buildBeltLines)
    // is ever visible. Spelled out with an explicit minimum extent.
    "Full-body or three-quarter body composition, framed from the head down to at least mid-thigh so the waistline is always clearly visible. Never crop the shot at or above the waist.",
    "Natural realistic human proportions.",
    "Clean neutral studio background.",
    "Soft professional lighting.",
    "Photorealistic fabric texture.",
    "Sharp clothing details.",
    "Natural posture.",
    "Single unified photograph -- no collage, no visible reference images, no other panels or frames.",
    "No inset photos, no thumbnails, no floating garment cutouts anywhere in the frame -- only the one model in the one photograph.",
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
