import { isValidOutfitStructure } from "./compatibilityRules";
import { scoreOutfitCandidate } from "./candidateScorer";
import type { CandidateGarment, OutfitCandidate } from "./types";

// Enumerates candidate outfits from the user's wardrobe that (a) always
// include the selected item and (b) form a valid structure (see
// isValidOutfitStructure). Small wardrobes -> small combination counts, so
// a straightforward enumeration is sufficient for the MVP (see spec
// section on performance -- no embeddings/vector search needed yet).
export function composeOutfitCandidates(
  selected: CandidateGarment,
  wardrobe: CandidateGarment[]
): OutfitCandidate[] {
  const others = wardrobe.filter((g) => g.id !== selected.id);
  const tops = others.filter((g) => g.role === "top");
  const bottoms = others.filter((g) => g.role === "bottom");
  const outerwear = others.filter((g) => g.role === "outerwear");

  const combos: CandidateGarment[][] = [];

  if (selected.role === "outerwear") {
    for (const top of tops) {
      for (const bottom of bottoms) {
        combos.push([selected, top, bottom]);
      }
    }
  } else if (selected.role === "top") {
    for (const bottom of bottoms) {
      combos.push([selected, bottom]);
      for (const jacket of outerwear) {
        combos.push([selected, bottom, jacket]);
      }
    }
  } else if (selected.role === "bottom") {
    for (const top of tops) {
      combos.push([selected, top]);
      for (const jacket of outerwear) {
        combos.push([selected, top, jacket]);
      }
    }
  }

  const valid = combos.filter((c) => isValidOutfitStructure(c.map((g) => g.role)));
  const scored = valid.map((c) => scoreOutfitCandidate(c));
  return scored.sort((a, b) => b.score - a.score);
}
