import { describe, it, expect, vi } from "vitest";
import { explainCandidates } from "@/lib/matching/aiStylist";
import type { AIProvider } from "@/lib/providers/types";
import type { OutfitCandidate } from "@/lib/matching/types";
import type { CandidateGarment } from "@/lib/matching/types";

function garment(id: string, role: string): CandidateGarment {
  return {
    id, role, category: role, subcategory: "x", primaryColor: "navy",
    primaryColorHex: null, pattern: "solid", style: "business_formal",
    formalityLevel: 4, visualDetails: null, imagePath: `${id}.jpg`,
  };
}

function candidate(score: number): OutfitCandidate {
  return {
    garments: [garment("a", "top"), garment("b", "bottom")],
    score,
    scoreBreakdown: { color: score, formality: score, style: score, pattern: score, silhouette: null },
  };
}

describe("explainCandidates", () => {
  it("attaches a Gemini explanation to each candidate on success", async () => {
    const ai: AIProvider = {
      analyzeClothingImage: vi.fn(),
      explainOutfitMatch: vi.fn().mockResolvedValue({ explanation: "Great pairing.", conflicts: [] }),
    };
    const result = await explainCandidates([candidate(90)], ai);
    expect(result[0].explanation).toBe("Great pairing.");
    expect(result[0].conflicts).toEqual([]);
  });

  it("falls back to a deterministic explanation when Gemini fails", async () => {
    const ai: AIProvider = {
      analyzeClothingImage: vi.fn(),
      explainOutfitMatch: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    };
    const result = await explainCandidates([candidate(90)], ai);
    expect(result[0].explanation).toBeTruthy();
    expect(result[0].conflicts).toEqual([]);
  });

  it("works with no AI provider at all", async () => {
    const result = await explainCandidates([candidate(45)], undefined);
    expect(result[0].explanation).toBeTruthy();
  });

  it("only processes the top-K candidates", async () => {
    const ai: AIProvider = {
      analyzeClothingImage: vi.fn(),
      explainOutfitMatch: vi.fn().mockResolvedValue({ explanation: "ok", conflicts: [] }),
    };
    const many = Array.from({ length: 10 }, (_, i) => candidate(100 - i));
    await explainCandidates(many, ai, 5);
    expect(ai.explainOutfitMatch).toHaveBeenCalledTimes(5);
  });
});
