import { describe, it, expect, vi } from "vitest";
import { FallbackAIProvider } from "@/lib/providers/fallback";
import type { AIProvider, ClothingAnalysis } from "@/lib/providers/types";

const analysis: ClothingAnalysis = {
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "white",
  secondaryColors: [],
  pattern: "solid",
  style: "business_formal",
  formalityLevel: 4,
  description: "A white long-sleeve shirt.",
};

function fakeProvider(overrides: Partial<AIProvider>): AIProvider {
  return {
    analyzeClothingImage: vi.fn().mockRejectedValue(new Error("not implemented")),
    explainOutfitMatch: vi.fn().mockRejectedValue(new Error("not implemented")),
    ...overrides,
  };
}

describe("FallbackAIProvider", () => {
  it("throws when constructed with no providers", () => {
    expect(() => new FallbackAIProvider([])).toThrow();
  });

  it("uses the primary provider's result when it succeeds", async () => {
    const primary = fakeProvider({ analyzeClothingImage: vi.fn().mockResolvedValue(analysis) });
    const secondary = fakeProvider({});
    const provider = new FallbackAIProvider([primary, secondary]);

    const result = await provider.analyzeClothingImage("https://example.com/x.jpg");

    expect(result).toEqual(analysis);
    expect(secondary.analyzeClothingImage).not.toHaveBeenCalled();
  });

  it("falls through to the secondary provider when the primary throws", async () => {
    const primary = fakeProvider({ analyzeClothingImage: vi.fn().mockRejectedValue(new Error("quota exceeded")) });
    const secondary = fakeProvider({ analyzeClothingImage: vi.fn().mockResolvedValue(analysis) });
    const provider = new FallbackAIProvider([primary, secondary]);

    const result = await provider.analyzeClothingImage("https://example.com/x.jpg");

    expect(result).toEqual(analysis);
    expect(primary.analyzeClothingImage).toHaveBeenCalledTimes(1);
    expect(secondary.analyzeClothingImage).toHaveBeenCalledTimes(1);
  });

  it("throws the last error when every provider fails", async () => {
    const primary = fakeProvider({ analyzeClothingImage: vi.fn().mockRejectedValue(new Error("primary failed")) });
    const secondary = fakeProvider({ analyzeClothingImage: vi.fn().mockRejectedValue(new Error("secondary failed")) });
    const provider = new FallbackAIProvider([primary, secondary]);

    await expect(provider.analyzeClothingImage("https://example.com/x.jpg")).rejects.toThrow("secondary failed");
  });

  it("applies the same fallback behavior to explainOutfitMatch", async () => {
    const primary = fakeProvider({
      explainOutfitMatch: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    });
    const secondary = fakeProvider({
      explainOutfitMatch: vi.fn().mockResolvedValue({ explanation: "Works well together.", conflicts: [] }),
    });
    const provider = new FallbackAIProvider([primary, secondary]);

    const result = await provider.explainOutfitMatch({ items: [], scoreBreakdown: {} });

    expect(result.explanation).toBe("Works well together.");
    expect(primary.explainOutfitMatch).toHaveBeenCalledTimes(1);
    expect(secondary.explainOutfitMatch).toHaveBeenCalledTimes(1);
  });

  it("tries providers strictly in order across more than two providers", async () => {
    const first = fakeProvider({ analyzeClothingImage: vi.fn().mockRejectedValue(new Error("fail 1")) });
    const second = fakeProvider({ analyzeClothingImage: vi.fn().mockRejectedValue(new Error("fail 2")) });
    const third = fakeProvider({ analyzeClothingImage: vi.fn().mockResolvedValue(analysis) });
    const provider = new FallbackAIProvider([first, second, third]);

    const result = await provider.analyzeClothingImage("https://example.com/x.jpg");

    expect(result).toEqual(analysis);
    expect(first.analyzeClothingImage).toHaveBeenCalledTimes(1);
    expect(second.analyzeClothingImage).toHaveBeenCalledTimes(1);
    expect(third.analyzeClothingImage).toHaveBeenCalledTimes(1);
  });
});
