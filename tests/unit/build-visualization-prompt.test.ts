import { describe, it, expect } from "vitest";
import { buildVisualizationPrompt, PROMPT_VERSION } from "@/lib/outfit/buildVisualizationPrompt";
import type { OutfitGarmentInput } from "@/lib/providers/types";

// This file previously exercised a large amount of per-garment dynamic
// prompt construction, then (v20-v23) a single static master prompt
// returned unconditionally regardless of which garments were selected --
// consolidated and merged from several brand/styling source documents
// (see the PROMPT_VERSION comment in buildVisualizationPrompt.ts for the
// full v20-v23 history: closure-mechanism hardening, American/25-40
// model styling, and a reversal making shirt/polo visibility win over an
// outer garment's own reference closure state).
//
// v24 is a root-cause fix, not another wording tweak: a real generation
// with 3 selected items (a slate blue SHORT-SLEEVED polo, beige pants,
// and a BLACK FULL-ZIP jacket) came back with the polo rendered as
// long-sleeved and the jacket omitted entirely. The static prompt gave
// FLUX literally no per-request information about what was selected --
// only the reference images themselves, with no text-side item count,
// category, color, sleeve length, or closure type to check against. v24
// reintroduces a DYNAMIC "0. SELECTED GARMENT MANIFEST" section, built
// fresh per request from the actual OutfitGarmentInput data (including a
// new `visualDetails.closure` field -- see gemini.ts), while keeping all
// of v20-v23's general, garment-independent rules unchanged. This test
// suite now covers both: the master rules are still checked for stability
// regardless of input, and the manifest is checked for actually varying
// with -- and accurately reflecting -- whatever was selected. The
// fixtures below intentionally mirror the reported bug's exact test case.

const jacket: OutfitGarmentInput = {
  imageUrl: "https://example.com/jacket.jpg",
  role: "outerwear",
  category: "outerwear",
  subcategory: "full_zip_jacket",
  primaryColor: "black",
  pattern: "solid",
  style: "business_casual",
  visualDetails: { sleeve: "long sleeve", closure: "full zipper" },
};
const shirt: OutfitGarmentInput = {
  imageUrl: "https://example.com/shirt.jpg",
  role: "top",
  category: "top",
  subcategory: "polo shirt",
  primaryColor: "slate blue",
  pattern: "solid",
  style: "casual",
  visualDetails: { sleeve: "short sleeve", collar: "polo collar" },
};
// Deliberately has no visualDetails, to exercise the "infer from the
// reference image" fallback wording rather than a fabricated default.
const pants: OutfitGarmentInput = {
  imageUrl: "https://example.com/pants.jpg",
  role: "bottom",
  category: "bottom",
  subcategory: "pants",
  primaryColor: "beige",
  pattern: "solid",
  style: "casual",
};

// The general master rules (sections 1-22 + FINAL OBJECTIVE) are meant to
// be identical no matter what's selected -- only the manifest/context
// note ahead of them should vary. This slices both prompts from the
// first stable rule section onward and compares that portion only.
function staticRulesPortion(prompt: string): string {
  const marker = "1. THE OUTFIT MUST BE WORN BY AN ADULT MALE MODEL";
  const index = prompt.indexOf(marker);
  expect(index).toBeGreaterThan(-1);
  return prompt.slice(index);
}

describe("buildVisualizationPrompt", () => {
  describe("static master rules", () => {
    it("keeps the general master rules identical regardless of which garments are selected -- only the manifest section should vary", () => {
      const withFullOutfit = staticRulesPortion(buildVisualizationPrompt([jacket, shirt, pants]));
      const withSingleItem = staticRulesPortion(buildVisualizationPrompt([shirt]));
      expect(withFullOutfit).toEqual(withSingleItem);
    });

    it("keeps the general master rules identical with or without an occasion/style context note", () => {
      const withContext = staticRulesPortion(
        buildVisualizationPrompt([jacket, shirt, pants], { occasion: "OFFICE", styleContext: "CLASSIC" })
      );
      const withoutContext = staticRulesPortion(buildVisualizationPrompt([jacket, shirt, pants]));
      expect(withContext).toEqual(withoutContext);
    });

    it("is the ARROW Philippines master prompt, covering the manifest section plus every numbered rule section", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
      expect(prompt).toContain("MASTER FAL.AI OUTFIT VISUALIZATION PROMPT");
      expect(prompt).toContain("ARROW PHILIPPINES — MEN'S FASHION");
      expect(prompt).toContain("0. SELECTED GARMENT MANIFEST");
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

    it("does not include race- or ethnicity-based model selection criteria (regression guard against a since-declined source document)", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).not.toContain("caucasian");
      expect(prompt).not.toContain("white american");
      expect(prompt).not.toContain("avoid asian");
      expect(prompt).not.toContain("latino");
      expect(prompt).not.toContain("hispanic");
      expect(prompt).not.toContain("middle eastern");
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

    it("requires the jacket's closure mechanism (zipper vs. buttons) to be preserved exactly -- the regression v21 was written to fix", () => {
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

    it("extends the never-render list with the v24 garment-fidelity additions from the reported bug report (omitted garments, wrong sleeve length)", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).toContain("an omitted jacket");
      expect(prompt).toContain("an omitted shirt");
      expect(prompt).toContain("a long sleeve rendered where a short sleeve was selected");
      expect(prompt).toContain("a short sleeve rendered where a long sleeve was selected");
    });

    it("tells FLUX to reproduce the exact selected garments as references rather than design or reinterpret an outfit (v24 header/objective wording)", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
      expect(prompt).toContain("WEARING THE EXACT SELECTED GARMENTS PROVIDED AS REFERENCES");
      expect(prompt.toLowerCase()).toContain('not a request to design an outfit "inspired by" the selection');
      expect(prompt.toLowerCase()).toContain("this is a request to visualize the exact products");
    });

    it("ties section 13 (all selected items present) and the final objective back to the section 0 manifest instead of a hardcoded example", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
      expect(prompt.toLowerCase()).toContain("every item listed in the selected garment manifest (section 0) must be represented");
      expect(prompt).toContain("SELECTED GARMENT MANIFEST (section 0)");
    });

    it("tells FLUX to use the manifest and the reference images together rather than as competing sources", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).toContain("the selected garment manifest (section 0) and the reference images work together");
    });
  });

  describe("SELECTED GARMENT MANIFEST (section 0) -- v24 dynamic per-request content", () => {
    it("states the exact number of selected garments and marks the manifest authoritative", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
      expect(prompt).toContain("There are exactly 3 selected garments for this request");
      expect(prompt.toLowerCase()).toContain("this manifest is authoritative");
    });

    it("uses correct singular/plural wording for a single selected garment", () => {
      const prompt = buildVisualizationPrompt([shirt]);
      expect(prompt).toContain("There are exactly 1 selected garment for this request");
    });

    it("describes each selected garment's role, category, subcategory, color, pattern, and style", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
      expect(prompt).toContain("ITEM 1 of 3:");
      expect(prompt).toContain("Category: outerwear");
      expect(prompt).toContain("Subcategory: full_zip_jacket");
      expect(prompt).toContain("Primary color: black");
      expect(prompt).toContain("ITEM 2 of 3:");
      expect(prompt).toContain("Subcategory: polo shirt");
      expect(prompt).toContain("Primary color: slate blue");
      expect(prompt).toContain("ITEM 3 of 3:");
      expect(prompt).toContain("Subcategory: pants");
      expect(prompt).toContain("Primary color: beige");
    });

    it("surfaces sleeve length and closure type from visualDetails when the product database has them -- the exact data the reported bug was missing", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
      expect(prompt).toContain("Sleeve length: long sleeve");
      expect(prompt).toContain("Closure: full zipper");
      expect(prompt).toContain("Sleeve length: short sleeve");
    });

    it("falls back to an explicit 'infer from the reference image' instruction when visualDetails is missing, instead of guessing or silently omitting the line", () => {
      const prompt = buildVisualizationPrompt([pants]);
      expect(prompt.toLowerCase()).toContain(
        "sleeve length: not recorded in the product database -- infer this from the reference image itself"
      );
      expect(prompt.toLowerCase()).toContain("do not guess a value that contradicts what the reference image actually shows");
    });

    it("ties each item to its own numbered reference image, in the same order the items are listed", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
      expect(prompt).toContain("reference image 1 of 3");
      expect(prompt).toContain("reference image 2 of 3");
      expect(prompt).toContain("reference image 3 of 3");
    });

    it("builds a numbered checklist naming every selected item by color and subcategory", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
      expect(prompt).toContain("1. The exact black full_zip_jacket");
      expect(prompt).toContain("2. The exact slate blue polo shirt");
      expect(prompt).toContain("3. The exact beige pants");
    });

    it("produces a different manifest for a different selection -- guards against the old input-independent behavior that let this bug slip through undetected", () => {
      const fullOutfit = buildVisualizationPrompt([jacket, shirt, pants]);
      const singleItem = buildVisualizationPrompt([shirt]);
      expect(fullOutfit).not.toEqual(singleItem);
    });

    it("returns an explicit error string in the manifest, instead of inventing an outfit, if ever called with no garments", () => {
      const prompt = buildVisualizationPrompt([]);
      expect(prompt.toLowerCase()).toContain("error: no selected garments were provided");
      expect(prompt.toLowerCase()).toContain("do not invent an outfit");
    });
  });

  describe("occasion/style context note", () => {
    it("adds an informational context note when occasion/styleContext are provided, explicitly scoped so it can't override the manifest", () => {
      const prompt = buildVisualizationPrompt([jacket], { occasion: "OFFICE", styleContext: "CLASSIC" });
      expect(prompt).toContain("Requested context: OFFICE, CLASSIC");
      expect(prompt.toLowerCase()).toContain("it never overrides the garment manifest above");
    });

    it("omits the context note entirely when no occasion/styleContext is given", () => {
      const prompt = buildVisualizationPrompt([jacket]);
      expect(prompt).not.toContain("Requested context:");
    });
  });

  describe("PROMPT_VERSION", () => {
    it("is a positive integer", () => {
      expect(Number.isInteger(PROMPT_VERSION)).toBe(true);
      expect(PROMPT_VERSION).toBeGreaterThan(0);
    });
  });
});
