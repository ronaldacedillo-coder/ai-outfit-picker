import { describe, it, expect } from "vitest";
import { buildVisualizationPrompt, PROMPT_VERSION } from "@/lib/outfit/buildVisualizationPrompt";
import type { OutfitGarmentInput } from "@/lib/providers/types";

// This file previously exercised a large amount of per-garment dynamic
// prompt construction (identity locks, sleeve-length locks, color/pattern
// fidelity, several iteratively-added "CRITICAL" rule blocks). At the
// user's explicit request, buildVisualizationPrompt.ts was reset to
// return a single static master prompt (supplied directly by the ARROW
// Philippines brand/styling team) unconditionally, regardless of which
// garments are selected. This test suite is intentionally much smaller
// now -- it just confirms the function is a stable, input-independent
// pass-through of that master prompt, plus a couple of sanity checks on
// its content and on PROMPT_VERSION.

const jacket: OutfitGarmentInput = {
  imageUrl: "https://example.com/jacket.jpg",
  role: "outerwear",
  category: "outerwear",
  subcategory: "business_jacket",
  primaryColor: "navy",
  pattern: "solid",
  style: "business_formal",
};
const shirt: OutfitGarmentInput = {
  imageUrl: "https://example.com/shirt.jpg",
  role: "top",
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "white",
  pattern: "solid",
  style: "business_formal",
};
const pants: OutfitGarmentInput = {
  imageUrl: "https://example.com/pants.jpg",
  role: "bottom",
  category: "bottom",
  subcategory: "pants",
  primaryColor: "gray",
  pattern: "solid",
  style: "business_formal",
};

describe("buildVisualizationPrompt", () => {
  it("returns the same master prompt text regardless of which garments are selected", () => {
    const withOutfit = buildVisualizationPrompt([jacket, shirt, pants]);
    const singleGarment = buildVisualizationPrompt([shirt]);
    const noGarments = buildVisualizationPrompt([]);
    expect(withOutfit).toEqual(singleGarment);
    expect(withOutfit).toEqual(noGarments);
  });

  it("returns the same master prompt text regardless of occasion/style context", () => {
    const withContext = buildVisualizationPrompt([jacket, shirt, pants], {
      occasion: "OFFICE",
      styleContext: "CLASSIC",
    });
    const withoutContext = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(withContext).toEqual(withoutContext);
  });

  it("is the ARROW Philippines master prompt, covering every numbered section", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt).toContain("MASTER FAL.AI OUTFIT VISUALIZATION PROMPT");
    expect(prompt).toContain("ARROW PHILIPPINES — MEN'S PREMIUM FASHION");
    expect(prompt).toContain("1. EXACT GARMENT PRESERVATION");
    expect(prompt).toContain("2. COMPLETE OUTFIT VISIBILITY — CRITICAL");
    expect(prompt).toContain("3. FULL-BODY / THREE-QUARTER COMPOSITION");
    expect(prompt).toContain("4. GARMENT LAYERING");
    expect(prompt).toContain("5. SLEEVE ACCURACY");
    expect(prompt).toContain("6. TROUSER / PANTS ACCURACY");
    expect(prompt).toContain("7. PRODUCT VISIBILITY OVER CINEMATIC COMPOSITION");
    expect(prompt).toContain("8. NO UNNECESSARY ACCESSORIES");
    expect(prompt).toContain("9. MODEL POSE");
    expect(prompt).toContain("10. CAMERA");
    expect(prompt).toContain("11. LIGHTING");
    expect(prompt).toContain("12. BACKGROUND");
    expect(prompt).toContain("13. MODEL APPEARANCE");
    expect(prompt).toContain("14. PHYSICAL REALISM");
    expect(prompt).toContain("15. PRODUCT IDENTITY HAS PRIORITY");
    expect(prompt).toContain('16. DO NOT "COMPLETE" THE OUTFIT');
    expect(prompt).toContain("17. DO NOT CHANGE THE OUTFIT");
    expect(prompt).toContain("18. FINAL QUALITY CHECK");
    expect(prompt).toContain("FINAL OBJECTIVE:");
  });

  it("requires an adult male model (this is a men's-only brand)", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("use an adult male model");
  });

  it("requires the jacket to remain the correct sleeve length independent of other garments", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("never transfer sleeve characteristics from one garment to another");
  });

  it("prioritizes garment fidelity and product visibility above aesthetic styling", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt).toContain("GARMENT FIDELITY AND PRODUCT VISIBILITY ALWAYS WIN.");
  });

  describe("PROMPT_VERSION", () => {
    it("is a positive integer", () => {
      expect(Number.isInteger(PROMPT_VERSION)).toBe(true);
      expect(PROMPT_VERSION).toBeGreaterThan(0);
    });
  });
});
