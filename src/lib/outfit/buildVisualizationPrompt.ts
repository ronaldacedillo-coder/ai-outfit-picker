import type { OutfitGarmentInput } from "@/lib/providers/types";
import type { Occasion, StyleContext } from "@/lib/validation/occasion";

// Bump whenever this file's template wording changes in a way that would
// meaningfully affect a generated image -- the outfit-generation cache
// keys on this so a prompt improvement never silently serves a stale
// image generated under the old wording.
//
// Reset to a fresh baseline (20). This file previously built the prompt
// dynamically per selected garment -- identity locks, sleeve-length
// locks, color/pattern fidelity lines, and a series of iteratively-added
// "CRITICAL" rule blocks each targeting a specific failure mode seen in
// real generations (a closed jacket hiding the shirt underneath, a
// headless/product-photo-style crop, the model posed holding the jacket
// open with his hands, a female model appearing for a men's-only brand).
// At the user's explicit request, all of that dynamic construction is
// replaced with a single static master prompt supplied directly by the
// ARROW Philippines brand/styling team, which covers the same ground
// (exact garment preservation, full outfit visibility, correct layering,
// sleeve/trouser accuracy, pose, camera, lighting, background, model
// requirements, and a final self-check) in its own authoritative wording.
//
// This prompt is intentionally the same for every generation -- it does
// not reference the specific selected garments by name, color, or
// construction detail. FLUX receives the actual selected garments as
// reference images separately (see fal-flux.ts, which still maps each
// selected garment to a reference image URL); this text is the
// instruction layer that governs how those reference images get turned
// into the final photograph, not a description of what's in them.
export const PROMPT_VERSION = 20;

const MASTER_PROMPT = `============================================================
MASTER FAL.AI OUTFIT VISUALIZATION PROMPT
ARROW PHILIPPINES — MEN'S PREMIUM FASHION
============================================================
You are generating a premium commercial menswear fashion photograph for ARROW Philippines.
The selected wardrobe items are the SOURCE OF TRUTH.
Your primary responsibility is to accurately show the EXACT selected garments being worn together as a complete men's outfit.
This is NOT an opportunity to redesign, reinterpret, substitute, simplify, merge, or improve the selected garments.
============================================================
1. EXACT GARMENT PRESERVATION
============================================================
Preserve every selected garment exactly as provided.
Maintain:
- garment category
- garment type
- silhouette
- proportions
- sleeve length
- collar
- neckline
- buttons
- zippers
- pockets
- closures
- seams
- cuffs
- fabric characteristics
- color
- pattern
- texture
- construction
- fit
- length
Do not replace any selected item with a visually similar garment.
Do not invent additional garments.
Do not remove selected garments.
Do not merge two garments into one.
Do not change one garment into another garment category.
The final image must clearly represent the actual selected ARROW products.
============================================================
2. COMPLETE OUTFIT VISIBILITY — CRITICAL
============================================================
ALL SELECTED OUTFIT ITEMS MUST BE VISUALLY ACCOUNTED FOR.
The composition must allow the viewer to clearly identify every selected garment.
Whenever physically possible, show the complete garment from its visible upper portion to its lower portion.
Do NOT crop the image in a way that hides an important selected garment.
Do NOT allow the model's body, pose, arms, hands, furniture, accessories, or other garments to unnecessarily obscure selected products.
The image should clearly show:
- outerwear
- shirt/polo
- trousers/pants
- shoes, if selected
- accessories, if selected
Every selected item must remain visually identifiable.
If an item is naturally layered beneath another item, show enough of it to clearly identify it while maintaining realistic garment layering.
============================================================
3. FULL-BODY / THREE-QUARTER COMPOSITION
============================================================
Use a premium full-body or three-quarter fashion composition that provides enough visual space to show the entire outfit.
Prefer:
- full-body standing pose
- relaxed natural posture
- slight three-quarter angle when useful
- both upper and lower garments visible
- shoes visible when selected
- sufficient space around the subject
Avoid:
- extreme close-ups
- waist-up portraits
- chest-only compositions
- cropped legs
- cropped feet
- excessive negative space that causes garments to become too small
- poses that hide the clothing
The outfit is the primary subject of the image.
The person's face and body are secondary.
============================================================
4. GARMENT LAYERING
============================================================
Maintain realistic physical layering.
The correct order must be preserved:
BODY
↓
INNER SHIRT / POLO
↓
JACKET / BLAZER / OUTERWEAR
↓
OTHER OUTER LAYERS
An outer jacket must remain outside the shirt.
A shirt must remain underneath the jacket.
Trousers must remain below the shirt/jacket.
Do not allow garments to visually merge.
Do not allow one garment to inherit the construction of another garment.
============================================================
5. SLEEVE ACCURACY
============================================================
NEVER transfer sleeve characteristics from one garment to another.
If the selected jacket is long-sleeved:
the jacket MUST remain long-sleeved and extend naturally toward the wrists.
If the selected polo/shirt is short-sleeved:
the polo/shirt MUST remain short-sleeved.
The short sleeve belongs ONLY to the polo/shirt.
Do not make a long-sleeved jacket into a short-sleeved jacket.
Do not make a short-sleeved polo into a long-sleeved shirt.
Do not invent visible shirt cuffs underneath jacket sleeves.
Do not create rolled sleeves unless the selected garment actually has rolled sleeves.
============================================================
6. TROUSER / PANTS ACCURACY
============================================================
If trousers or pants are selected:
preserve their actual:
- style
- fit
- silhouette
- waist
- rise
- leg shape
- length
- color
- fabric
- construction
Do not turn trousers into shorts.
Do not change straight-leg trousers into skinny trousers.
Do not change slim-fit trousers into wide-leg trousers.
Do not invent cuffs or pleats.
The trousers must remain clearly visible down to their natural hem.
If shoes are selected, show the shoes clearly enough to identify them.
============================================================
7. PRODUCT VISIBILITY OVER CINEMATIC COMPOSITION
============================================================
Commercial product visibility has higher priority than cinematic photography.
Do NOT sacrifice visibility of selected garments for:
- dramatic poses
- extreme camera angles
- cinematic shadows
- artistic cropping
- fashion editorial abstraction
- excessive depth of field
- dramatic movement
- props
- furniture
- environmental storytelling
The viewer should immediately understand what clothing products are being presented.
============================================================
8. NO UNNECESSARY ACCESSORIES
============================================================
Do not introduce:
- hats
- scarves
- watches
- bags
- jewelry
- ties
- pocket squares
- belts
- sunglasses
- coats
- additional shirts
- additional jackets
unless they are explicitly selected or specifically requested by the styling instruction.
Do not let accessories obscure the selected garments.
============================================================
9. MODEL POSE
============================================================
Use a confident, natural men's fashion pose appropriate for a premium business-casual / formal menswear brand.
Preferred:
- standing
- relaxed shoulders
- natural arm position
- arms not covering the torso
- legs separated enough to reveal the trousers
- natural posture
- confident but understated expression
Avoid poses where:
- arms cross over the chest
- hands cover the shirt
- hands cover the jacket
- legs overlap excessively
- one leg completely hides the other
- the model sits down unless specifically requested
- the model turns away from the camera
- the clothing is hidden by the pose
============================================================
10. CAMERA
============================================================
Use a professional commercial menswear photography perspective.
Preferred:
- eye-level or slightly below eye-level camera
- natural perspective
- full-body or three-quarter framing
- moderate focal length
- minimal distortion
- straight vertical lines
- realistic human proportions
Avoid:
- fisheye distortion
- extreme wide-angle distortion
- exaggerated perspective
- unnaturally long legs
- unnaturally large torso
- distorted hands
- distorted shoes
============================================================
11. LIGHTING
============================================================
Use premium fashion-retail lighting.
Lighting should be:
- soft
- controlled
- flattering
- natural-looking
- sufficient to reveal garment details
- sufficient to distinguish layers
- sufficient to show fabric texture
Do not use lighting that causes:
- black clothing to lose detail
- white clothing to blow out
- garment colors to shift
- deep shadows that hide products
- excessive highlights
- artificial glossy effects
============================================================
12. BACKGROUND
============================================================
Use a sophisticated, minimal environment appropriate for a premium men's fashion brand.
Prefer:
- warm neutral studio
- premium contemporary interior
- elegant retail environment
- understated architectural setting
The background must remain secondary.
Do not use:
- busy backgrounds
- distracting objects
- excessive props
- colorful environments
- environments that compete with the clothing
============================================================
13. MODEL APPEARANCE
============================================================
Use an adult male model appropriate for a premium international menswear campaign.
The model should look:
- sophisticated
- confident
- professional
- natural
- polished
- commercially appropriate
Avoid exaggerated model poses or unrealistic physiques.
The clothing must remain the visual focus.
============================================================
14. PHYSICAL REALISM
============================================================
All garments must behave like real physical clothing.
Respect:
- gravity
- fabric draping
- seams
- garment boundaries
- occlusion
- sleeve openings
- collars
- buttons
- pockets
- hems
- waistlines
- layering
- realistic fabric tension
Do not allow garments to intersect unnaturally.
Do not allow clothing to float.
Do not allow fabric to pass through the body.
Do not create impossible garment geometry.
============================================================
15. PRODUCT IDENTITY HAS PRIORITY
============================================================
PRIORITY ORDER:
1. Preserve the exact selected garments.
2. Show ALL selected garments clearly.
3. Preserve correct garment layering.
4. Preserve correct proportions and construction.
5. Maintain realistic human anatomy and clothing physics.
6. Create a premium menswear photograph.
7. Add aesthetic/editorial styling.
If any instruction conflicts with garment fidelity or product visibility:
GARMENT FIDELITY AND PRODUCT VISIBILITY ALWAYS WIN.
============================================================
16. DO NOT "COMPLETE" THE OUTFIT
============================================================
Do not automatically add garments because the outfit appears incomplete.
If the user selects:
jacket + polo + trousers
generate:
jacket + polo + trousers.
Do not add:
tie
belt
vest
coat
additional shirt
pocket square
scarf
or any other garment
unless explicitly requested.
============================================================
17. DO NOT CHANGE THE OUTFIT
============================================================
Do not:
- substitute a suit for a jacket
- substitute a blazer for a jacket
- turn a polo into a dress shirt
- turn trousers into shorts
- turn trousers into jeans
- change a jacket's sleeve length
- change a shirt's sleeve length
- change collars
- change colors
- change patterns
- change garment proportions
- add/remove buttons
- add/remove pockets
- change the garment's construction
The selected items define the outfit.
============================================================
18. FINAL QUALITY CHECK
============================================================
Before producing the final image, internally verify:
✓ Every selected garment is present.
✓ Every selected garment is recognizable.
✓ No selected garment has been substituted.
✓ No garment has been unintentionally redesigned.
✓ The outer jacket remains the correct sleeve length.
✓ The inner shirt/polo remains the correct sleeve length.
✓ Trousers remain trousers.
✓ The correct trousers style is preserved.
✓ All selected garments are sufficiently visible.
✓ The model's pose does not unnecessarily hide the outfit.
✓ The complete outfit is visible from upper body through feet when appropriate.
✓ No unnecessary accessories were added.
✓ Garments layer correctly.
✓ Garments behave realistically.
✓ Product colors remain accurate.
✓ Product proportions remain accurate.
✓ The image looks like a premium commercial men's fashion photograph.
FINAL OBJECTIVE:
Generate a sophisticated, realistic, premium men's fashion photograph that presents the EXACT selected ARROW garments as a complete, clearly visible outfit.
The image should look suitable for a premium ARROW Philippines product presentation, styling recommendation, or retail campaign.
The clothing is the hero.
The model supports the clothing.
The composition supports product visibility.
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
