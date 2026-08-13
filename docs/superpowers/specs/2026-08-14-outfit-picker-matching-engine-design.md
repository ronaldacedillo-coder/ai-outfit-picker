# Outfit Picker + Matching Engine — Design Spec

**Status:** Approved
**Date:** 2026-08-14
**Milestone:** Transform the wardrobe into an AI-assisted personal stylist — select an item, get ranked outfit recommendations with explanations, visualize the chosen one via the existing FLUX pipeline.
**Relationship to prior work:** Builds on Wardrobe Core (clothing schema, `AIProvider`) and the FLUX milestone (`ImageGenProvider`, `generateOutfitVisualization`, `outfit-images` storage). Does **not** modify `FalFluxImageGenProvider`, `buildVisualizationPrompt`, `SupabaseStorageProvider`, the reference-image strategy, or `FAL_KEY` handling.

---

## 1. Scope

**In scope:** deterministic compatibility engine (category, color, formality, style, pattern, silhouette), outfit composition from the user's real wardrobe, Gemini stylist reasoning on the top deterministic candidates only, a new server action to compute recommendations, an Outfit Picker UI, wiring "Visualize Outfit" to the existing (lightly extended) `generateOutfitVisualization`.

**Explicitly out of scope:** any change to the FLUX generation pipeline itself, embeddings/vector search, a machine-learning feedback loop (the UI hook for 👍/👎 is designed for, not built), elaborate caching (only same-click duplicate-request prevention).

---

## 2. Confirmed decisions

1. **No new DB columns for scoring.** `outfits.starting_item_id`, `compatibility_score`, `score_breakdown`, `ai_explanation`, and `outfit_items.role` already exist, unused, from the foundation schema. Populate them; don't duplicate them.
2. **Recommendations are ephemeral until visualized.** `findMatchingOutfits` computes and returns candidates to the client with no DB writes. Only `generateOutfitVisualization` (already existing) writes an `outfits` row, exactly as it does today — extended with one new optional parameter to also persist the score/explanation that led to that visualization.
3. **Category/structure validity is a hard pre-filter**, not a weighted score component. Valid structure = exactly one bottom + exactly one top-family item (shirt or polo), + optional outerwear. The selected item is always included.
4. **Scoring weights** (documented, adjustable in one place): color 30%, formality 25%, style 20%, pattern 15%, silhouette 10% (re-normalized when silhouette data is absent on either item, never zero-filled).
5. **`AIProvider.explainOutfitMatch` is extended** from `Promise<string>` to structured, Zod-validated JSON: `{ explanation: string; conflicts: string[]; rank?: number }`. Called only on the top-K (5) deterministic candidates, never the full wardrobe.
6. **Gemini is optional, not a hard dependency.** If it fails or is unavailable, deterministic ranking and a deterministic-only explanation still ship.
7. **`generateOutfitVisualization` gets one new optional 4th parameter** carrying `{ compatibilityScore, scoreBreakdown, aiExplanation }`, written into the `outfits` row alongside the existing generation fields. No other change to that function; FLUX/storage/reference-image code paths are untouched.
8. **Cost control:** one FLUX generation per explicit user click on one chosen candidate — never one per recommendation shown.

---

## 3. Compatibility model

### Category / structure (hard filter)
```
GARMENT_SLOTS: outerwear (optional), top (shirt|polo, required), bottom (pants, required)
```
A candidate is valid iff it has exactly one bottom and exactly one top-family item; outerwear is optional and never sufficient alone. The originally-selected item's role determines which other slot(s) the composer fills from the rest of the wardrobe.

### Color compatibility (deterministic)
A canonical palette table (black, white, navy, blue, light blue, gray, charcoal, beige, khaki, cream, brown, burgundy, green, olive — extensible) with `family` (neutral/blue/red/green/brown/yellow/purple) and `tone` (light/medium/dark) metadata, matched via the same loose token-normalization technique already used in `src/lib/wardrobe/matchCategory.ts` (so "navy" and "dark blue" resolve to the same entry). Scoring: neutral+anything scores high; same-family (analogous) scores high; documented complementary pairs score well; unrelated families score moderate (never zero — "reasonable ranking, not absolute prohibition," per spec). When both items have a hex value, hue/lightness distance refines (not replaces) the name-based score.

### Formality compatibility
Distance-based on the existing `formality_level` (1-5): same level scores highest, distance scales down smoothly, never a hard cutoff.

### Style compatibility
Categorical match on the existing `style` enum. Deliberately correlated with formality in the current data — documented as a known overlap, not hidden.

### Pattern compatibility
solid+solid best; solid+pattern good; pattern+pattern lower (never blocked) — matches the existing `pattern` enum.

### Silhouette compatibility
Best-effort only, from `ai_analysis.visualDetails.silhouette` (free-form, often absent). When present on both items, a small keyword-compatibility table contributes 10% weight; when absent on either, that weight is redistributed across the other components rather than defaulting to a penalty.

### Overall score
`0-100`, weighted sum of the above (post category-filter), surfaced to the user as a quality label ("Excellent match" / "Very good match" / "Good match" / "Possible match"), never as a bare number in primary UI copy.

---

## 4. Architecture

```
src/lib/matching/
  types.ts
  colorCompatibility.ts
  compatibilityRules.ts   (formality, style, pattern, silhouette + category structure filter)
  candidateScorer.ts      (weighted combination, documented weights)
  outfitComposer.ts       (enumerate valid structures from the user's wardrobe)
  aiStylist.ts            (Gemini reasoning on top-K candidates, Zod-validated, optional)

src/app/dashboard/matching-actions.ts
  findMatchingOutfits(selectedItemId, injectedClient?, injectedAI?)
    -> { data: { candidates: RankedOutfitCandidate[] } } | { error }
```

`generateOutfitVisualization` (existing, in `src/app/dashboard/outfit-actions.ts`) gets one new optional parameter (see decision 7) — everything else about it is unchanged.

---

## 5. UI flow

`WardrobeGrid`/`ClothingCard` gain a "Find outfits" action → Outfit Picker view (selected item + ranked recommendation cards: thumbnails, quality label, short explanation, "Visualize Outfit" button) → clicking Visualize calls the existing action (now carrying score/explanation) → generated-outfit view (image, item list, Back / Try another, one-shot generation, no auto-regen). Product language avoids technical terms ("match," not "compatibility vector"; "Great match," not "score: 87"). Visual treatment aims more premium/editorial than the current utilitarian wardrobe screens, per explicit product direction.

---

## 6. Error handling / edge cases

- No compatible items found → "We couldn't find a strong match in your wardrobe yet," with a suggestion to add more items.
- Only one category present → no crash, empty/partial recommendations.
- Missing metadata on a candidate → use what's available; never assume a missing value.
- Gemini unavailable/fails → deterministic recommendations and explanation still returned.
- Large wardrobe → composer works over structured metadata only, not images; no unnecessary image loads during matching.

---

## 7. Testing plan

Unit: every compatibility function (the full color-pair list from the spec, category validity for all four structures, ranking order given multiple candidates, missing-attribute handling), mocked-Gemini `aiStylist` (valid/invalid JSON/missing fields/failure — deterministic ranking must survive all of these). Integration: RLS isolation (user A cannot see user B's wardrobe/candidates), end-to-end selected-item → `findMatchingOutfits` → `generateOutfitVisualization` with FLUX mocked (no real paid calls in automated tests, matching the existing `injectedImageGen` DI pattern).
