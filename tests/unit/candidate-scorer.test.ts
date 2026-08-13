import { describe, it, expect } from "vitest";
import { scoreOutfitCandidate } from "@/lib/matching/candidateScorer";
import type { CandidateGarment } from "@/lib/matching/types";

function garment(overrides: Partial<CandidateGarment>): CandidateGarment {
  return {
    id: "id",
    role: "top",
    category: "top",
    subcategory: "long_sleeve_shirt",
    primaryColor: "white",
    primaryColorHex: null,
    pattern: "solid",
    style: "business_formal",
    formalityLevel: 4,
    visualDetails: null,
    imagePath: "path.jpg",
    ...overrides,
  };
}

describe("scoreOutfitCandidate", () => {
  it("scores a coherent business outfit highly", () => {
    const jacket = garment({ role: "outerwear", primaryColor: "navy", formalityLevel: 4, style: "business_formal" });
    const shirt = garment({ role: "top", primaryColor: "white", formalityLevel: 4, style: "business_formal" });
    const pants = garment({ role: "bottom", primaryColor: "charcoal", formalityLevel: 4, style: "business_formal" });
    const result = scoreOutfitCandidate([jacket, shirt, pants]);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.scoreBreakdown.color).toBeGreaterThan(0);
  });

  it("scores a clashing outfit lower than a coherent one", () => {
    const jacket = garment({ role: "outerwear", primaryColor: "navy", formalityLevel: 5, style: "business_formal" });
    const shirt = garment({ role: "top", primaryColor: "green", formalityLevel: 1, style: "casual", pattern: "printed" });
    const pants = garment({ role: "bottom", primaryColor: "burgundy", formalityLevel: 1, style: "casual", pattern: "plaid" });
    const coherentShirt = garment({ role: "top", primaryColor: "white", formalityLevel: 4, style: "business_formal" });
    const coherentPants = garment({ role: "bottom", primaryColor: "charcoal", formalityLevel: 4, style: "business_formal" });

    const clashing = scoreOutfitCandidate([jacket, shirt, pants]);
    const coherent = scoreOutfitCandidate([jacket, coherentShirt, coherentPants]);
    expect(clashing.score).toBeLessThan(coherent.score);
  });

  it("re-normalizes weights when silhouette data is absent instead of penalizing", () => {
    const shirt = garment({ role: "top" });
    const pants = garment({ role: "bottom" });
    const result = scoreOutfitCandidate([shirt, pants]);
    expect(result.scoreBreakdown.silhouette).toBeNull();
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("produces a score between 0 and 100", () => {
    const shirt = garment({ role: "top" });
    const pants = garment({ role: "bottom" });
    const result = scoreOutfitCandidate([shirt, pants]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
