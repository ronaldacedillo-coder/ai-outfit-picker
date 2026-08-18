import { describe, it, expect } from "vitest";
import { buildVisualizationPrompt, PROMPT_VERSION } from "@/lib/outfit/buildVisualizationPrompt";
import type { OutfitGarmentInput } from "@/lib/providers/types";

// This file previously exercised a large amount of per-garment dynamic
// prompt construction (identity locks, sleeve-length locks, color/pattern
// fidelity, several iteratively-added "CRITICAL" rule blocks). At the
// user's explicit request, buildVisualizationPrompt.ts returns a single
// static master prompt unconditionally, regardless of which garments are
// selected -- since consolidated (v21) from two overlapping brand/styling
// documents, with a stronger emphasis on closure-mechanism preservation
// (zipper stays a zipper, buttons stay buttons) after that exact
// regression showed up in review, then further merged (v22) with a third,
// infographic-style source that added explicit American/25-40 model
// styling, a hard shirt/polo-visibility requirement, and a handful of
// pose/background/negative-list additions -- reconciled against the v21
// closure rule rather than left silently contradicting it (see section 3
// and the PROMPT_VERSION comment in buildVisualizationPrompt.ts for the
// resolution: an outer layer's own reference closure state always wins).
// This test suite is intentionally much smaller than the old dynamic one
// -- it confirms the function is a stable, input-independent pass-through
// of the master prompt, plus sanity checks on its content and on
// PROMPT_VERSION.

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
    expect(prompt).toContain("ARROW PHILIPPINES — MEN'S FASHION");
    expect(prompt).toContain("1. THE OUTFIT MUST BE WORN BY AN ADULT MALE MODEL");
    expect(prompt).toContain("2. THE CLOTHING IS STILL THE HERO");
    expect(prompt).toContain("3. FULL OUTFIT MUST BE VISIBLE");
    expect(prompt).toContain("4. EXACT GARMENT PRESERVATION — ABSOLUTE RULE");
    expect(prompt).toContain("5. CRITICAL ZIPPER / CLOSURE PRESERVATION RULE");
    expect(prompt).toContain("6. GENERAL CLOSURE PRESERVATION");
    expect(prompt).toContain("7. CRITICAL GARMENT IDENTITY RULE");
    expect(prompt).toContain("8. JACKET / BLAZER DISTINCTION");
    expect(prompt).toContain("9. SHIRT / POLO / JACKET SLEEVE RULE");
    expect(prompt).toContain("10. PANTS / TROUSER PRESERVATION");
    expect(prompt).toContain("11. PRODUCT IMAGE IS THE SOURCE OF TRUTH");
    expect(prompt).toContain("12. LAYERING");
    expect(prompt).toContain("13. ALL SELECTED ITEMS MUST BE PRESENT");
    expect(prompt).toContain("14. MODEL POSE");
    expect(prompt).toContain("15. CAMERA");
    expect(prompt).toContain("16. LIGHTING");
    expect(prompt).toContain("17. BACKGROUND");
    expect(prompt).toContain("18. NO UNSELECTED GARMENTS");
    expect(prompt).toContain("19. NO GENERIC FASHION REINTERPRETATION");
    expect(prompt).toContain("20. PRIORITY ORDER");
    expect(prompt).toContain("21. FINAL INTERNAL VALIDATION");
    expect(prompt).toContain("22. NEVER RENDER");
    expect(prompt).toContain("FINAL OBJECTIVE");
  });

  it("requires an adult male model, explicitly ruling out female/child/ambiguous models (this is a men's-only brand)", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt).toContain("ADULT MALE MODEL");
    expect(prompt.toLowerCase()).toContain("female models");
    expect(prompt.toLowerCase()).toContain("children");
    expect(prompt.toLowerCase()).toContain("gender-ambiguous models");
  });

  it("styles the model as classic American with an explicit 25-40 age range (v22 merge)", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("classic american look");
    expect(prompt).toContain("25-40");
  });

  it("requires a shirt/polo worn with no outerwear to be fully visible, while an outer layer's own reference closure state still wins when outerwear is selected (v22 reconciliation)", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain(
      "if a shirt or polo is selected with no outerwear over it, that shirt/polo must be fully visible"
    );
    expect(prompt.toLowerCase()).toContain("this visibility goal is secondary to preserving that outerwear's own closure state");
    expect(prompt.toLowerCase()).toContain("do not open a jacket that the reference shows closed just to reveal more of the layer beneath it");
  });

  it("requires both legs and shoes (when selected) to remain visible with a centered, balanced pose (v22 merge)", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("both legs and shoes (when shoes are selected) must be visible");
  });

  it("adds natural lighting and ARROW's classic American heritage/brand-identity language to background and lighting (v22 merge)", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("lighting should be natural and flattering");
    expect(prompt.toLowerCase()).toContain("a clean, classic american setting");
    expect(prompt.toLowerCase()).toContain("reflect arrow's classic american heritage throughout");
  });

  it("requires the jacket's closure mechanism (zipper vs. buttons) to be preserved exactly -- the regression this consolidation was written to fix", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt).toContain("IT MUST REMAIN A ZIPPER.");
    expect(prompt.toLowerCase()).toContain("do not confuse");
    expect(prompt).toContain("ZIP-UP JACKET");
    expect(prompt.toLowerCase()).toContain("must not acquire");
    expect(prompt.toLowerCase()).toContain("suit-style lapels");
  });

  it("requires the jacket to remain the correct sleeve length independent of other garments", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("preserve the actual sleeve length of every garment independently");
  });

  it("prioritizes exact garment identity above artistic/editorial aesthetics", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt).toContain("GARMENT ACCURACY WINS.");
    expect(prompt).toContain("Exact selected garment identity.");
  });

  it("folds the never-render list into the prompt text, since the FLUX Kontext API has no separate negative_prompt field", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("this api has no separate negative-prompt field");
    expect(prompt.toLowerCase()).toContain("button jacket instead of zipper jacket");
    expect(prompt.toLowerCase()).toContain("female model");
  });

  it("extends the never-render list with the v22 additions (torso-only presentation, unrealistic body proportions) and restates the shirt-visibility fallback", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("torso-only presentation");
    expect(prompt.toLowerCase()).toContain("unrealistic body proportions");
    expect(prompt.toLowerCase()).toContain(
      "when no outerwear is selected, or selected outerwear's own reference photo shows it open, never hide, partially show, or imply a selected shirt/polo"
    );
  });

  describe("PROMPT_VERSION", () => {
    it("is a positive integer", () => {
      expect(Number.isInteger(PROMPT_VERSION)).toBe(true);
      expect(PROMPT_VERSION).toBeGreaterThan(0);
    });
  });
});
