import { describe, it, expect } from "vitest";
import { composeOutfitCandidates } from "@/lib/matching/outfitComposer";
import type { CandidateGarment } from "@/lib/matching/types";

function garment(id: string, overrides: Partial<CandidateGarment>): CandidateGarment {
  return {
    id,
    role: "top",
    category: "top",
    subcategory: "long_sleeve_shirt",
    primaryColor: "white",
    primaryColorHex: null,
    pattern: "solid",
    style: "business_formal",
    formalityLevel: 4,
    visualDetails: null,
    imagePath: `${id}.jpg`,
    ...overrides,
  };
}

describe("composeOutfitCandidates", () => {
  const jacket = garment("jacket", { role: "outerwear", primaryColor: "navy" });
  const shirt = garment("shirt", { role: "top", primaryColor: "white" });
  const polo = garment("polo", { role: "top", primaryColor: "beige", subcategory: "polo_shirt" });
  const pants = garment("pants", { role: "bottom", primaryColor: "charcoal" });

  it("always includes the selected item in every candidate", () => {
    const candidates = composeOutfitCandidates(jacket, [shirt, polo, pants, jacket]);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.garments.some((g) => g.id === jacket.id)).toBe(true);
    }
  });

  it("produces only valid structures when the selection is a jacket", () => {
    const candidates = composeOutfitCandidates(jacket, [shirt, polo, pants, jacket]);
    for (const c of candidates) {
      const roles = c.garments.map((g) => g.role);
      expect(roles).toContain("top");
      expect(roles).toContain("bottom");
    }
  });

  it("produces a shirt+pants candidate when the selection is a shirt", () => {
    const candidates = composeOutfitCandidates(shirt, [shirt, jacket, pants]);
    const rolesSets = candidates.map((c) => c.garments.map((g) => g.role).sort().join(","));
    expect(rolesSets).toContain("bottom,top");
  });

  it("returns an empty list when no complementary items exist", () => {
    const candidates = composeOutfitCandidates(jacket, [jacket]);
    expect(candidates).toEqual([]);
  });

  it("ranks the highest-scoring candidate first", () => {
    const candidates = composeOutfitCandidates(jacket, [shirt, polo, pants, jacket]);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });
});
