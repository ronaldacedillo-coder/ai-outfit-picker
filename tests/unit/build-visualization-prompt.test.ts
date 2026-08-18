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
// styling and a handful of pose/background/negative-list additions.
//
// v23 merged a fourth, follow-up source. Two things worth noting about
// it here (see the fuller PROMPT_VERSION comment in
// buildVisualizationPrompt.ts): first, that source specified the model's
// race/ethnicity (a "Caucasian (White)" requirement plus a list of
// ethnicities to avoid) -- that content was deliberately left out, since
// it's race-based exclusion criteria for who can appear in generated
// marketing imagery; a regression test below guards against it silently
// reappearing. Second, per explicit user decision, shirt/polo visibility
// now takes PRIORITY over an outer garment's own reference closure state
// -- a reversal of the v21/v22 rule -- so outerwear is opened/unzipped as
// needed to keep an underlying shirt/polo visible; only the closure
// MECHANISM (zipper vs. buttons, construction) is still preserved
// exactly regardless of open/closed state.
//
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

  it("requires a selected shirt/polo to stay fully visible even under outerwear, opening/unzipping the outerwear as needed rather than preserving its closed reference state (v23 reversal)", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain(
      "if a shirt or polo is selected, it must remain fully visible -- its sleeves, collar, and front must all be seen -- whether or not outerwear is also selected"
    );
    expect(prompt.toLowerCase()).toContain("this takes priority over preserving the outerwear's own reference closure state");
    expect(prompt.toLowerCase()).toContain("do not hide the shirt/polo under a closed jacket");
  });

  it("still preserves the jacket's closure MECHANISM (zipper construction/hardware) even when it must be shown open for shirt visibility (v23)", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("shirt/polo visibility takes priority over the jacket's default reference closure state");
    expect(prompt.toLowerCase()).toContain(
      "the zipper itself, its track, pull, and hardware must still be reproduced exactly, and the garment must still visibly be a zip-up jacket"
    );
  });

  it("does not include race- or ethnicity-based model selection criteria (regression guard against a since-declined source document)", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
    expect(prompt).not.toContain("caucasian");
    expect(prompt).not.toContain("white american");
    expect(prompt).not.toContain("avoid asian");
    expect(prompt).not.toContain("latino");
    expect(prompt).not.toContain("hispanic");
    expect(prompt).not.toContain("middle eastern");
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

  it("extends the never-render list with the v22 additions (torso-only presentation, unrealistic body proportions)", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("torso-only presentation");
    expect(prompt.toLowerCase()).toContain("unrealistic body proportions");
  });

  it("restates the shirt-visibility rule unconditionally in the never-render list, since v23 removed the old 'only when outerwear is open' carve-out", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt.toLowerCase()).toContain("a shirt or polo hidden or covered by a jacket");
    expect(prompt.toLowerCase()).toContain(
      "never hide, partially show, or imply a selected shirt/polo instead of showing it in full (sleeves, collar, and front all visible) -- this applies whether or not outerwear is also selected"
    );
  });

  describe("PROMPT_VERSION", () => {
    it("is a positive integer", () => {
      expect(Number.isInteger(PROMPT_VERSION)).toBe(true);
      expect(PROMPT_VERSION).toBeGreaterThan(0);
    });
  });
});
