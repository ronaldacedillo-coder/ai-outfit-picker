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
// This prompt is intentionally the same for every generation -- it does
// not reference the specific selected garments by name, color, or
// construction detail. FLUX receives the actual selected garments as
// reference images separately (see fal-flux.ts, which still maps each
// selected garment to a reference image URL); this text is the
// instruction layer that governs how those reference images get turned
// into the final photograph, not a description of what's in them.
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
export const PROMPT_VERSION = 23;

const MASTER_PROMPT = `============================================================
MASTER FAL.AI OUTFIT VISUALIZATION PROMPT
ARROW PHILIPPINES — MEN'S FASHION
============================================================
Generate a premium commercial menswear fashion photograph for ARROW Philippines that consistently:
1. Shows the COMPLETE selected outfit being worn by an ADULT MALE MODEL.
2. Preserves the EXACT construction and identity of every selected garment.
3. Preserves the exact closure mechanism of each garment.
4. Keeps ALL selected garments visible and identifiable.
5. Never converts one garment type into another.
6. Reads as a premium commercial menswear photograph appropriate for ARROW Philippines.
============================================================
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
============================================================
12. LAYERING
============================================================
Maintain realistic physical layering.
Example:
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
Every selected item must be represented in the final image.
If the selected outfit contains:
1. Jacket
2. Polo
3. Trousers
4. Shoes
the final image must contain:
1. The exact jacket
2. The exact polo
3. The exact trousers
4. The exact shoes
Do not omit an item because it is visually inconvenient.
Do not substitute an item.
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
REDESIGNING THE GARMENTS.
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
============================================================
FINAL OBJECTIVE
============================================================
Generate a sophisticated, realistic, premium men's fashion photograph that presents the EXACT selected ARROW garments as a complete, clearly visible outfit, worn by a realistic adult male model, with the exact garment construction and closure mechanisms preserved -- a zip-up jacket must still be a zip-up jacket, never a button jacket or blazer.
The image should look suitable for a premium ARROW Philippines product presentation, styling recommendation, or retail campaign.
The clothing is the hero. The model supports the clothing. The composition supports product visibility.
Do not optimize for a beautiful generic fashion image. Optimize for: exact product + complete outfit + male model + commercial presentation.
Garment accuracy is more important than artistic interpretation.`;

// Signature kept identical to the previous per-garment implementation so
// callers (fal-flux.ts) and the outfit-generation cache (which hashes on
// selected items + occasion/styleContext + ruleVersion + PROMPT_VERSION,
// see combinationHash.ts) don't need to change -- the garments and
// context are still part of what makes an outfit combination unique for
// caching purposes, they're just no longer woven into the prompt text
// itself.
export function buildVisualizationPrompt(
  _garments: OutfitGarmentInput[],
  _context?: { occasion?: Occasion; styleContext?: StyleContext }
): string {
  return MASTER_PROMPT;
}
