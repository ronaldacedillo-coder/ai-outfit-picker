import type { OutfitGarmentInput } from "@/lib/providers/types";
import type { Occasion, StyleContext } from "@/lib/validation/occasion";

// Bump whenever this file's template wording changes in a way that would
// meaningfully affect a generated image -- the outfit-generation cache
// keys on this so a prompt improvement never silently serves a stale
// image generated under the old wording. Old cached rows/images are
// never deleted when this bumps -- they just stop matching new
// combination-hash lookups (see combinationHash.ts), so history is
// preserved and only new generations pick up the updated wording.
//
// Reset to a fresh baseline (20) when this file switched from building
// the prompt dynamically per selected garment to a single static master
// prompt supplied by the ARROW Philippines brand/styling team.
//
// Bumped again (21) to fold in a second, more detailed instruction set
// from the same brand/styling source, specifically hardening garment
// CLOSURE-MECHANISM preservation (zipper stays a zipper, buttons stay
// buttons, a zip-up jacket must never render as a button-front blazer or
// suit jacket) after this exact regression showed up in review, plus an
// explicit "never render" list. The two source documents overlapped
// heavily (garment fidelity, full visibility, layering, sleeve/trouser
// accuracy, pose, camera, lighting, background, model requirements, a
// final self-check) -- rather than concatenating both and risking
// conflicting or redundant instructions, this is a single consolidated
// prompt built from the more detailed, more recent source, which is a
// strict superset of the first document's coverage.
//
// Bumped again (22) to fold in a third source (an infographic-style spec,
// framed around a short-sleeve-shirt + pants combo with its own model,
// pose, background, and negative-prompt sections). At the user's explicit
// instruction, this merge keeps the v21 zipper/closure-preservation rules
// -- the new source is silent on jackets/outerwear entirely, so it isn't
// contradicting them, just not addressing that case. It DOES add real
// specificity worth keeping: "American" model styling, an explicit
// 25-40 age range, and a hard requirement that a short-sleeved shirt
// stay fully visible. That last one is in real tension with the v21
// closure rule for a combination this app's own outfitComposer.ts
// generates constantly (shirt + zipped-closed jacket): keeping a
// zipped-closed jacket's reference closure state means the shirt
// underneath is necessarily less visible. Rather than silently picking
// one side, section 3 below now states the resolution explicitly: an
// outer layer's own reference photo's closure state (open or closed)
// always wins, and full inner-layer visibility is the goal only when
// that's compatible with it (no outer layer selected, or the outer
// layer's reference shows it open).
//
// The fal.ai FLUX Kontext API (both the single-image and multi-image
// endpoints this app uses -- confirmed against fal.ai's own API
// reference docs) has no separate negative_prompt parameter, unlike some
// other image models. The "never render" / negative-prompt lists from
// both source documents are therefore folded into this prompt's own text
// (see section 22 below) rather than sent as a separate request field.
//
// Bumped again (23) from a follow-up brand-supplied update ("CLAUDE CODE
// -- FOLLOW UP PROMPT UPDATE FOR FAL.AI OUTFIT GENERATION"). Two things
// worth calling out about this one:
//
// 1. That source's section 2 specified the model's race/ethnicity --
//    "Use a Caucasian (White) American male model" plus an explicit list
//    of ethnicities to avoid (Asian, African, Middle Eastern, Indian,
//    Latino/Hispanic). That is race-based exclusion criteria for who can
//    appear in the brand's generated marketing imagery, and it was left
//    out of this prompt entirely -- including a matching set of terms
//    that source wanted added to the negative-render list. Section 1
//    below still uses the existing race-neutral "classic American look...
//    natural, confident" styling language from v21/v22, unchanged.
//
// 2. That source also required a selected shirt/polo to stay visible
//    EVEN WHEN WORN UNDER A JACKET, which is a direct reversal of the
//    v21/v22 rule that a jacket shown zipped/buttoned closed in its own
//    reference photo should stay closed (added specifically to fix a
//    zipper-to-blazer conversion regression). Per explicit user decision,
//    shirt/polo visibility now wins: outerwear is opened/unzipped as
//    needed to keep an underlying shirt/polo visible, even if its
//    reference photo shows it fully closed. This changes only how OPEN
//    the outerwear is worn -- the v21 closure-MECHANISM rules (a zipper
//    must stay a zipper, construction/hardware preserved exactly) are
//    untouched; see sections 3 and 5 below for the exact wording.
//
// Bumped again (24) after a root-cause fix, not just a wording tweak. The
// reported failure: a selected slate-blue SHORT-SLEEVED polo rendered as
// a long-sleeved shirt, and a selected BLACK FULL-ZIP JACKET was omitted
// from the image entirely. Root cause: since v20, this function has
// returned the same static MASTER_PROMPT text regardless of which
// garments were actually selected (see the old comment on
// buildVisualizationPrompt below, now removed) -- the ONLY per-request
// signal FLUX ever received about what to render was the reference
// images themselves (see fal-flux.ts's image_url/image_urls), with zero
// text-side information distinguishing item count, category, color,
// sleeve length, or closure type. That's a real gap: reference images
// alone were not reliably enough for FLUX to preserve every selected
// item's identity across a 3-image multi-garment request, exactly as
// reported. Fixed by reintroducing a DYNAMIC per-request section (see
// "0. SELECTED GARMENT MANIFEST" below, built by buildGarmentManifest())
// that lists every selected garment's role/category/subcategory/color/
// pattern/style plus, where the product database has them, its sleeve
// length and closure type (see OutfitGarmentInput.visualDetails, now
// also populated by Gemini's "closure" field -- see gemini.ts). This is
// additive, not a rollback of v20-23: all of the general, garment-
// independent rules from those versions (sections 1-22 below) are
// unchanged; the manifest is new content prepended ahead of them, marked
// authoritative over both the general rules and FLUX's own visual
// interpretation of the reference images. Section 13's old body (a
// static, always-the-same "if your outfit contains 1. Jacket 2. Polo
// 3. Trousers 4. Shoes..." example, unrelated to what was actually
// selected) has been replaced with a reference to the real manifest, and
// the header/final-objective wording now explicitly says to generate a
// photograph of the model "wearing the exact selected garments provided
// as references," per this fix's own instruction not to let FLUX "design
// an outfit inspired by" the selection.
//
// Bumped again (25) after a second, related root-cause report: a plain
// solid-gray full-zip jacket kept coming back with invented surface
// texture/patterning (woven grain, speckling, etc.) even though nothing
// about it should have been ambiguous -- its own `pattern` attribute in
// the product database is "solid". The gap: section 0's manifest already
// surfaced each item's Pattern field (e.g. "solid", "striped"), but
// nothing in the prompt ever explained what "solid" is supposed to mean
// for image generation specifically -- that a plain/solid surface must
// stay photographically smooth (folds, highlights, and shadows are fine)
// and must NOT be reinterpreted as "textured" just because a fully flat,
// zero-detail surface can look less "realistic" to an image model than
// one with invented grain. Fixed generically, not as a one-off for this
// jacket: describeGarment() now derives an explicit Surface requirement
// line from each item's own `pattern` value (solid -> stay plain/smooth,
// non-solid -> preserve that exact pattern, unknown -> infer from the
// reference image) -- see surfaceRequirementFor() below. This applies to
// every selected garment via the existing per-request manifest, the same
// mechanism v24 introduced for sleeve length and closure. A new section
// 23 states the general rule once, plus the specific gray-jacket
// instruction as a worked example (not a special-cased hack -- the
// enforcement itself is entirely data-driven per garment). Section 22's
// never-render list and section 21's self-check gained matching
// pattern/surface entries, and a cross-garment-leakage rule (never
// transfer one item's pattern, texture, or color onto a different item)
// was added to close the general version of the same class of bug.
export const PROMPT_VERSION = 25;

// Renders one garment's known attributes as a labeled block. Missing
// visualDetails entries (sleeve/closure/collar/silhouette) are common --
// that data depends on what Gemini's vision analysis actually reported
// for that specific item (see gemini.ts) -- so a missing value says so
// explicitly and defers to the reference image, rather than silently
// omitting the line or guessing a default that could contradict what the
// reference image actually shows.
function attr(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

const INFER_FROM_IMAGE =
  "not recorded in the product database -- infer this from the reference image itself, and do not guess a value that contradicts what the reference image actually shows";

// Non-solid values from the app's own pattern enum (see
// src/lib/validation/clothing.ts's patternEnum) -- kept here as a plain
// list rather than importing the enum, since this file only needs the
// one bit of information (solid vs. not) and shouldn't take on a
// dependency for it.
const NON_SOLID_PATTERNS = new Set(["striped", "checked", "plaid", "printed", "textured", "other"]);

// This is the fix for a report distinct from, but structurally identical
// to, the v24 bug: a garment's `pattern` attribute already lived in the
// product database and was already surfaced as a "Pattern: solid" line
// in the manifest, but nothing ever explained what a FLUX model should
// actually do with that fact -- so a plain gray jacket kept coming back
// with invented woven texture. This makes the instruction explicit and
// derives it straight from the stored attribute, generically, for every
// garment -- not hardcoded to any one item.
function surfaceRequirementFor(pattern: string | undefined | null): string {
  const normalized = pattern?.trim().toLowerCase();
  if (!normalized) {
    return "not recorded in the product database -- infer the surface/pattern from the reference image itself and preserve exactly what it shows, whether that is a plain solid surface or an actual pattern.";
  }
  if (NON_SOLID_PATTERNS.has(normalized)) {
    return `${normalized.toUpperCase()} -- this item has a ${normalized} pattern in the reference image. Preserve that exact pattern faithfully; do not remove it, simplify it into a solid color, fade it, or replace it with a different pattern.`;
  }
  // Anything else (in practice: "solid", the common case) is treated as
  // solid rather than matched against an exact string, so this degrades
  // safely if the stored value is ever something unexpected -- the
  // default behavior for an unrecognized pattern value should be "keep
  // it plain," not "assume it's fine to invent texture."
  return "SOLID -- this item must remain a plain, smooth, unpatterned surface in its stated primary color. Natural photographic fabric folds, highlights, and shadows are allowed and expected -- they are not a \"pattern\" and are not an excuse to add one. Do NOT add: weave texture, jacquard, herringbone, tweed, knit texture, speckling, heathering, marling, mottling, checks, stripes, camouflage, geometric patterns, tonal patterns, embossed or raised texture, decorative stitching, or any other surface detail not present in the reference image.";
}

function describeGarment(garment: OutfitGarmentInput, index: number, total: number): string {
  const details = garment.visualDetails ?? {};
  const colorLabel = garment.primaryColorHex
    ? `${attr(garment.primaryColor, "unspecified")} (${garment.primaryColorHex})`
    : attr(garment.primaryColor, "unspecified");
  return [
    `ITEM ${index + 1} of ${total}:`,
    `Role: ${attr(garment.role, "unspecified")}`,
    `Category: ${attr(garment.category, "unspecified")}`,
    `Subcategory: ${attr(garment.subcategory, "unspecified")}`,
    `Primary color: ${colorLabel}`,
    `Pattern: ${attr(garment.pattern, "unspecified")}`,
    `Surface requirement: ${surfaceRequirementFor(garment.pattern)}`,
    `Style: ${attr(garment.style, "unspecified")}`,
    `Sleeve length: ${attr(details.sleeve, INFER_FROM_IMAGE)}`,
    `Closure: ${attr(details.closure, INFER_FROM_IMAGE)}`,
    `Collar: ${attr(details.collar, INFER_FROM_IMAGE)}`,
    `Silhouette: ${attr(details.silhouette, INFER_FROM_IMAGE)}`,
    `Reference image: reference image ${index + 1} of ${total}, supplied alongside this prompt in this same order -- the authoritative visual source for this exact item's construction, color, and fine detail.`,
  ].join("\n");
}

// The manifest is the fix for the specific failure this version was
// bumped for: a request with N selected garments must make it
// unambiguous, in the prompt TEXT (not just via N reference images),
// that there are exactly N items, what each one is, and that all N must
// appear. Every field here comes straight from the product database via
// OutfitGarmentInput (see buildGarmentInput.ts) -- nothing is invented.
function buildGarmentManifest(garments: OutfitGarmentInput[]): string {
  if (garments.length === 0) {
    // Should never happen in real use -- outfit-actions.ts rejects an
    // empty selection before a generation is ever requested. Fails loud
    // in the prompt text itself rather than silently letting FLUX invent
    // an outfit from nothing if this invariant is ever violated upstream.
    return "ERROR: no selected garments were provided with this request. Do not invent an outfit -- treat this as an application error, not a styling decision.";
  }
  const itemDescriptions = garments.map((g, i) => describeGarment(g, i, garments.length)).join("\n\n");
  const itemChecklist = garments
    .map((g, i) => {
      const color = attr(g.primaryColor, "").trim();
      const noun = attr(g.subcategory, attr(g.category, "selected item"));
      return `${i + 1}. The exact ${[color, noun].filter(Boolean).join(" ")}`;
    })
    .join("\n");
  return `There are exactly ${garments.length} selected garment${garments.length === 1 ? "" : "s"} for this request, retrieved directly from the ARROW product database, each with its own reference image. This manifest is AUTHORITATIVE: it takes priority over any general styling assumption elsewhere in this prompt and over the AI's own visual interpretation of the reference images. Do not add an item, omit an item, or substitute an item for a different one.

${itemDescriptions}

The final image MUST contain all ${garments.length} of the items above, each visually identifiable as the specific item described, in exactly this quantity -- no fewer, no more, no substitutions, no reinterpretation:
${itemChecklist}`;
}

const MASTER_PROMPT_HEADER = `============================================================
MASTER FAL.AI OUTFIT VISUALIZATION PROMPT
ARROW PHILIPPINES — MEN'S FASHION
============================================================
Generate a realistic photograph of an adult male model WEARING THE EXACT SELECTED GARMENTS PROVIDED AS REFERENCES -- see the SELECTED GARMENT MANIFEST immediately below and the reference images supplied alongside this prompt. This is not a request to design an outfit "inspired by" the selection, or to style a similar look -- reproduce the exact selected ARROW products, worn together exactly as they exist in the product catalog.
This photograph must consistently:
1. Show the COMPLETE selected outfit being worn by an ADULT MALE MODEL.
2. Preserve the EXACT construction and identity of every selected garment.
3. Preserve the exact closure mechanism of each garment.
4. Keep ALL selected garments visible and identifiable.
5. Never convert one garment type into another.
6. Read as a premium commercial menswear photograph appropriate for ARROW Philippines.`;

const MASTER_PROMPT_BODY = `============================================================
1. THE OUTFIT MUST BE WORN BY AN ADULT MALE MODEL
============================================================
The generated image MUST show the selected outfit being worn by a realistic ADULT MALE MODEL.
Do NOT generate:
- flat-lay clothing
- clothing floating in the image
- empty garments
- mannequin-only presentation
- clothing-only product arrangements
- invisible models
- female models
- children
- gender-ambiguous models
The purpose of the image is to show the customer:
"THIS IS WHAT THESE EXACT ARROW MEN'S GARMENTS LOOK LIKE WHEN WORN TOGETHER."
The adult male model is required.
The model should look like a sophisticated premium menswear customer/model appropriate for ARROW Philippines: styled with a classic American look, apparent age 25-40, natural, confident, and relaxed in expression, with a clean-cut appearance fitting ARROW's brand heritage.
============================================================
2. THE CLOTHING IS STILL THE HERO
============================================================
The model supports the clothing.
The image should NOT become primarily a portrait of the model.
Prioritize:
GARMENT VISIBILITY
GARMENT ACCURACY
OUTFIT COMPLETENESS
over:
facial detail
dramatic posing
cinematic composition
artistic photography
Use a professional full-body or three-quarter/full-length fashion composition.
The model's face may be visible, but it must not dominate the image.
============================================================
3. FULL OUTFIT MUST BE VISIBLE
============================================================
Show all selected garments clearly.
Preferred composition:
- adult male standing
- full body
- head to shoes visible where appropriate
- natural upright posture
- arms positioned naturally without covering the garments
- legs separated naturally enough to show the trousers
- clothing clearly visible
- minimal obstruction
Do not crop:
- the jacket
- shirt/polo
- trousers
- shoes if selected
Do not crop at the chest or waist. Show the complete outfit from the upper torso to the shoes.
Do not use poses that hide important garment areas.
Avoid:
- crossed arms covering the chest
- hands covering the jacket
- seated poses
- extreme side profiles
- legs crossed tightly
- excessive movement
- cropped feet
- cropped trousers
- extreme close-ups
If a shirt or polo is selected, it must remain fully visible -- its sleeves, collar, and front must all be seen -- whether or not outerwear is also selected.
When outerwear is also selected, this takes priority over preserving the outerwear's own reference closure state (compare section 5): open or unzip the outerwear as needed so the shirt/polo underneath stays visible, even if the outerwear's reference photo shows it zipped or buttoned fully closed. Do not hide the shirt/polo under a closed jacket. This changes only how open the outerwear is worn, not its construction -- the outerwear's closure MECHANISM (zipper vs. buttons, hardware, track) must still be reproduced exactly; a zip-up jacket worn open must still visibly be a zip-up jacket, not a different garment.
============================================================
4. EXACT GARMENT PRESERVATION — ABSOLUTE RULE
============================================================
Every selected wardrobe item is an authoritative reference.
Reproduce the selected garment itself.
Do NOT substitute a visually similar garment.
Do NOT redesign it.
Do NOT reinterpret it.
Do NOT modernize it.
Do NOT "improve" it.
Do NOT change its construction.
Do NOT change its garment category.
Do NOT change its proportions.
Do NOT change its closure mechanism.
The selected wardrobe image takes priority over any assumption about what the outfit should look like.
============================================================
5. CRITICAL ZIPPER / CLOSURE PRESERVATION RULE
============================================================
THIS IS A CRITICAL REQUIREMENT.
The closure mechanism visible in the selected reference garment MUST remain exactly the same in the generated image.
If the selected garment has a ZIPPER:
IT MUST REMAIN A ZIPPER.
Do NOT convert it into:
- buttons
- buttonholes
- a button placket
- a suit jacket
- a blazer
- a double-breasted jacket
- a hidden button jacket
- a snap-button jacket
If the selected garment is a ZIP-UP JACKET, the generated garment must visibly remain a ZIP-UP JACKET.
Preserve:
- zipper location
- zipper direction
- zipper length
- zipper track
- zipper pull
- front opening construction
- collar/neck construction
- jacket front construction
If the selected jacket is zipped closed in the reference, keep it zipped closed BY DEFAULT.
EXCEPTION: if a shirt or polo is also selected underneath the jacket, open or unzip the jacket enough to keep that shirt/polo fully visible (see section 3) -- shirt/polo visibility takes priority over the jacket's default reference closure state. This changes only how open the jacket is worn, never its construction: the zipper itself, its track, pull, and hardware must still be reproduced exactly, and the garment must still visibly be a zip-up jacket, not a different garment.
Do not replace the zipper with buttons.
Do not add buttons that do not exist.
============================================================
6. GENERAL CLOSURE PRESERVATION
============================================================
Apply the same rule to EVERY selected garment.
Preserve the actual closure mechanism:
ZIPPER → ZIPPER
BUTTON → BUTTON
SNAP → SNAP
HOOK → HOOK
BUCKLE → BUCKLE
DRAWSTRING → DRAWSTRING
Never substitute one closure type for another.
If a garment has no visible closure, do not invent one.
Preserving a closure mechanism means preserving what KIND of closure it is (zipper, button, snap, etc.) and its construction -- not necessarily whether it is worn open or closed, which section 3 and section 5 govern when outerwear is worn over a selected shirt or polo.
============================================================
7. CRITICAL GARMENT IDENTITY RULE
============================================================
Preserve the following characteristics exactly:
- garment category
- garment type
- silhouette
- fit
- length
- sleeve length
- sleeve construction
- collar
- neckline
- closure mechanism
- zipper/button configuration
- pockets
- seams
- cuffs
- hems
- fabric
- texture
- color
- pattern
- proportions
- distinctive construction details
Render the selected garment itself, NOT a generic approximation of the garment category.
============================================================
8. JACKET / BLAZER DISTINCTION
============================================================
Do not confuse:
ZIP-UP JACKET
with:
BUTTON-FRONT BLAZER
or:
BUTTON-FRONT SUIT JACKET.
If the selected outer garment is a zip-up jacket:
it must visually remain a zip-up jacket.
It must NOT acquire:
- suit-style lapels
- button rows
- buttonholes
- blazer construction
- suit jacket construction
- double-breasted construction
A jacket without lapels must not suddenly develop lapels.
A jacket with a zipper must not suddenly develop buttons.
============================================================
9. SHIRT / POLO / JACKET SLEEVE RULE
============================================================
Preserve the actual sleeve length of every garment independently.
If the selected outer jacket is long-sleeved:
the jacket MUST remain long-sleeved.
If the selected polo/shirt is short-sleeved:
the polo/shirt MUST remain short-sleeved.
Never transfer the sleeve characteristics of one garment to another.
Never make a long-sleeved jacket short-sleeved.
Never make a short-sleeved polo long-sleeved.
Do not invent shirt cuffs underneath jacket sleeves.
============================================================
10. PANTS / TROUSER PRESERVATION
============================================================
Preserve the exact selected trouser/pants:
- style
- fit
- silhouette
- waist
- leg shape
- length
- color
- fabric
- construction
Do not turn trousers into shorts.
Do not change slim fit into regular fit.
Do not change regular fit into wide-leg.
Do not invent pleats.
Do not invent cuffs.
Do not change the waist construction.
============================================================
11. PRODUCT IMAGE IS THE SOURCE OF TRUTH
============================================================
When reference images are provided for selected garments:
use them as the authoritative visual reference.
Infer WHAT THE GARMENT ACTUALLY IS from the reference image.
Do not rely on generic assumptions based on the product name.
For example:
If the product is called "jacket" but the reference clearly shows a zip-up jacket:
generate the zip-up jacket.
If the product is called "shirt" but the reference clearly shows a short-sleeved polo:
generate the short-sleeved polo.
IMAGE REFERENCE > GENERIC PRODUCT CATEGORY ASSUMPTIONS.
The SELECTED GARMENT MANIFEST (section 0) and the reference images work together, not as competing sources: use the manifest's structured attributes (sleeve length, closure, color, pattern) to confirm what each reference image shows, and use the reference image itself for exact visual construction, silhouette, and fine detail. If they ever appear to conflict, still render the item as faithfully as possible to both -- never drop a selected garment, or fall back to a generic version of it, because of an apparent mismatch.
============================================================
12. LAYERING
============================================================
Maintain realistic physical layering.
Example (illustrative order only -- see section 0 for the garments actually selected in this request):
adult male model
↓
short-sleeved polo
↓
full-sleeved zip-up jacket
↓
trousers
↓
shoes
Do not merge garments.
Do not make one garment inherit another garment's features.
Do not allow garments to pass through one another.
============================================================
13. ALL SELECTED ITEMS MUST BE PRESENT
============================================================
Every item listed in the SELECTED GARMENT MANIFEST (section 0) must be represented in the final image, in exactly that quantity -- neither fewer nor more items.
Do not omit an item because it is visually inconvenient.
Do not substitute an item.
Do not merge two selected items into one, and do not split one selected item into two.
============================================================
14. MODEL POSE
============================================================
Use a premium men's fashion pose.
Preferred:
- standing
- relaxed
- confident
- natural
- professional
- arms relaxed at the sides or positioned so they do not obscure clothing
- one hand relaxed in a pocket, if natural for the pose
- legs naturally separated
- front or subtle three-quarter orientation
Avoid:
- crossed arms
- hands covering clothing
- hands in front of the jacket zipper
- sitting
- leaning against objects
- extreme walking poses
- dramatic movement
- poses that hide trousers
- poses that hide shoes
- any pose that hides the shirt/polo underneath outerwear
Both legs and shoes (when shoes are selected) must be visible, with the model centered in a clean, balanced composition.
============================================================
15. CAMERA
============================================================
Use a professional commercial menswear camera setup.
Preferred:
- eye level
- natural perspective
- full-body framing
- moderate focal length
- minimal distortion
- enough space around the model
- straight vertical lines
The model should occupy enough of the frame for the clothing details to remain clearly visible.
============================================================
16. LIGHTING
============================================================
Use premium commercial fashion lighting.
The lighting must reveal:
- zipper
- buttons
- collars
- fabric
- seams
- pockets
- garment boundaries
- color
Lighting should be natural and flattering, showing true colors and fabric texture.
Do not use dramatic shadows that hide garment construction.
Use soft shadows and balanced exposure rather than harsh contrast that could hide garment details or a shirt/polo worn underneath outerwear.
============================================================
17. BACKGROUND
============================================================
Use a sophisticated, minimal, premium environment.
Preferred:
- warm ivory studio
- refined contemporary interior
- premium retail environment
- understated architectural background
- a clean, classic American setting: a modern office, an upscale urban space, or a heritage-inspired interior
- a downtown city street with classic American architecture
- an upscale office environment
- a country club or golf course setting
- a coastal boardwalk
- a refined cafe or bookstore interior
- a neutral studio with warm tones
The background must remain secondary to the outfit and complement it, never distract from it.
Reflect ARROW's classic American heritage throughout: timeless, smart, and refined. The overall image should read as a premium lifestyle or catalog photograph.
============================================================
18. NO UNSELECTED GARMENTS
============================================================
Do NOT add:
- tie
- vest
- dress shirt
- additional jacket
- coat
- scarf
- belt
- pocket square
- hat
- jewelry
- bag
- additional accessories
unless explicitly selected or requested.
Do not use accessories to make the image look more fashionable.
============================================================
19. NO GENERIC FASHION REINTERPRETATION
============================================================
Do not "style" the selected products by changing their construction.
Styling means:
COMBINING THE SELECTED GARMENTS.
Styling does NOT mean:
REDESIGNING THE GARMENTS, OR CREATING SOMETHING "INSPIRED BY" THEM.
This is a request to VISUALIZE the exact products in the SELECTED GARMENT MANIFEST (section 0) being worn together -- not a request to design clothing.
============================================================
20. PRIORITY ORDER
============================================================
Use this priority hierarchy:
PRIORITY 1:
Exact selected garment identity.
PRIORITY 2:
All selected garments present and clearly visible.
PRIORITY 3:
Correct garment construction and closure mechanisms.
PRIORITY 4:
Correct layering and physical realism.
PRIORITY 5:
Correct sleeve length and garment proportions.
PRIORITY 6:
Realistic adult male model.
PRIORITY 7:
Premium ARROW menswear photography.
PRIORITY 8:
Artistic/editorial aesthetics.
If aesthetics conflict with garment accuracy:
GARMENT ACCURACY WINS.
============================================================
21. FINAL INTERNAL VALIDATION
============================================================
Before finishing, verify:
- Adult male model is present.
- Complete outfit is visible.
- Every selected garment is present.
- Every selected garment remains recognizable.
- Jacket type is unchanged.
- Jacket closure is unchanged.
- Zipper remains zipper.
- Buttons remain buttons.
- No zipper has been replaced by buttons.
- No buttons have been replaced by a zipper.
- Jacket sleeve length is correct.
- Shirt/polo sleeve length is correct.
- Trouser style is correct.
- Trouser length is correct.
- No unselected garment was added.
- No selected garment was removed.
- Each garment's pattern matches its manifest entry: no invented texture, weave, or pattern on a garment marked solid, and no lost or altered pattern on a garment that actually has one.
- No garment's pattern, texture, or color has been transferred onto a different garment.
- Garments are layered realistically.
- Model pose does not hide important garments.
- Product details are sufficiently visible.
- The image looks like premium commercial men's fashion photography.
If any check fails, the image is wrong.
============================================================
22. NEVER RENDER (this API has no separate negative-prompt field, so these
constraints are stated directly rather than passed separately)
============================================================
The generated image must never show:
button jacket instead of zipper jacket, button-front jacket, button-up jacket, suit jacket, blazer, double-breasted jacket, invented buttons, invented buttonholes, missing zipper, replaced zipper, altered closure, incorrect closure, redesigned garment, substituted garment, generic clothing, a different garment than selected, short-sleeved jacket, cropped jacket sleeves, long-sleeved polo, shirt cuffs peeking from jacket sleeves, invented cuffs, rolled sleeves that weren't selected, extra garments, extra shirt, extra jacket, extra coat, extra accessories, a missing selected garment, a hidden garment, occluded clothing, cropped outfit, cropped legs, cropped feet, missing shoes, cropped shoes, flat lay, clothing without a model, a mannequin, torso-only presentation, a female model, a child, empty clothing, floating clothing, distorted clothing, merged garments, incorrect layering, unrealistic garment construction, unrealistic body proportions, distorted anatomy, an extreme pose, crossed arms, hands covering clothing, a sitting pose, fashion-editorial abstraction, excessive shadows, harsh contrast that hides garment details, clothing obscured by props, a shirt or polo hidden or covered by a jacket, a shirt not visible under a jacket, or a jacket covering the shirt. Never hide, partially show, or imply a selected shirt/polo instead of showing it in full (sleeves, collar, and front all visible) -- this applies whether or not outerwear is also selected; open or unzip outerwear as needed rather than hiding the shirt/polo beneath it.
Also never show: an omitted jacket, an omitted shirt, an omitted selected garment, a wrong garment, a sport coat in place of a selected garment, a pullover in place of a selected garment, a wrong closure type, incorrect garment color, duplicate garments, an incomplete outfit, a fashion reinterpretation of the selection, a garment redesign, a long sleeve rendered where a short sleeve was selected, or a short sleeve rendered where a long sleeve was selected.
Also never show, on any garment whose manifest entry (section 0) marks it solid: an invented pattern, invented fabric texture, a woven texture, herringbone, jacquard, tweed, knitted texture, a heathered surface, a marled surface, a speckled surface, a mottled surface, checks, stripes, camouflage, or an embossed or raised texture -- and on any garment whose manifest entry marks it as having an actual pattern: a removed, faded, or simplified pattern, or a substituted pattern. Never show one selected garment's pattern, texture, or color transferred onto a different selected garment.
============================================================
23. PATTERN AND SURFACE FIDELITY
============================================================
Every selected garment's pattern (or lack of one) is defined by that item's own Pattern and Surface requirement lines in the SELECTED GARMENT MANIFEST (section 0), together with its reference image -- reproduce it exactly.
If an item's pattern is SOLID:
it must render as a plain, smooth, unpatterned surface in its own stated color.
Natural photographic fabric folds, highlights, and shadows are allowed and expected -- they are not a "pattern" and are not an excuse to add one.
Do NOT add weave texture, jacquard, herringbone, tweed, knit texture, speckling, heathering, marling, mottling, checks, stripes, camouflage, geometric or tonal patterns, embossed or raised texture, decorative stitching, or fabric graphics that are not present in the reference image.
If an item's pattern is striped, checked, plaid, printed, textured, or otherwise non-solid:
preserve that exact pattern faithfully.
Do not remove it, simplify it into a solid color, fade it, or replace it with a different pattern.
Do not confuse "realistic fabric" with "textured fabric": a smooth, plain, solid-color garment rendered with realistic lighting, folds, and subtle natural shading is CORRECT; that same garment rendered with visible woven grain, speckling, patterning, herringbone, jacquard, or any other decorative surface detail is INCORRECT, even if it looks more "photographic."
Worked example (this rule is general -- it applies to every solid-pattern garment, not only this one): a plain solid-gray full-zip jacket is a PLAIN SOLID-GRAY GARMENT. REPRODUCE IT EXACTLY AS SHOWN IN THE PRODUCT REFERENCE. DO NOT ADD ANY PATTERN, TEXTURE, WEAVE, PRINT, OR DECORATIVE SURFACE DETAIL. NATURAL LIGHTING AND NATURAL FABRIC FOLDS ARE ALLOWED, BUT THE JACKET'S SURFACE MUST REMAIN VISUALLY SMOOTH, UNIFORM, AND SOLID GRAY.
Never transfer one garment's pattern, texture, fabric appearance, or color onto a different garment. Each selected garment keeps only its own attributes, exactly as listed in its own entry in section 0.
============================================================
FINAL OBJECTIVE
============================================================
Generate a sophisticated, realistic, premium men's fashion photograph that presents the EXACT selected ARROW garments listed in the SELECTED GARMENT MANIFEST (section 0) as a complete, clearly visible outfit, worn by a realistic adult male model reproducing those exact garments from their reference images, with the exact garment construction and closure mechanisms preserved -- a zip-up jacket must still be a zip-up jacket, never a button jacket or blazer.
The image should look suitable for a premium ARROW Philippines product presentation, styling recommendation, or retail campaign.
The clothing is the hero. The model supports the clothing. The composition supports product visibility.
Do not optimize for a beautiful generic fashion image. Optimize for: exact product + complete outfit + male model + commercial presentation.
Garment accuracy is more important than artistic interpretation.`;

// Builds the per-request prompt: the SELECTED GARMENT MANIFEST (dynamic,
// built fresh from the actual selected items) followed by the general
// ARROW master prompt (static across requests -- sections 1-22 plus the
// final objective, unchanged in substance since v23 aside from the
// section 13/19 and header/final-objective wording called out in the
// PROMPT_VERSION comment above). `context` (occasion/styleContext) is
// surfaced as an informational note only -- it must never be able to
// override the garment manifest, which is why it's phrased that way
// explicitly rather than woven into the rules themselves.
export function buildVisualizationPrompt(
  garments: OutfitGarmentInput[],
  context?: { occasion?: Occasion; styleContext?: StyleContext }
): string {
  const manifestSection = `============================================================
0. SELECTED GARMENT MANIFEST — AUTHORITATIVE, READ FIRST
============================================================
${buildGarmentManifest(garments)}`;
  const contextValues = [context?.occasion, context?.styleContext].filter(Boolean);
  const contextNote =
    contextValues.length > 0
      ? `\nRequested context: ${contextValues.join(", ")}. This informs pose and setting choices only -- it never overrides the garment manifest above.\n`
      : "";
  return `${MASTER_PROMPT_HEADER}\n${manifestSection}\n${contextNote}${MASTER_PROMPT_BODY}`;
}
