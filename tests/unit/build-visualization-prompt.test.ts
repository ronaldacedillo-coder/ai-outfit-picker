import { describe, it, expect } from "vitest";
import { buildVisualizationPrompt, PROMPT_VERSION } from "@/lib/outfit/buildVisualizationPrompt";
import type { OutfitGarmentInput } from "@/lib/providers/types";

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
  it("mentions every selected garment's color and subcategory", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt).toContain("navy");
    expect(prompt).toContain("business jacket");
    expect(prompt).toContain("white");
    expect(prompt).toContain("long sleeve shirt");
    expect(prompt).toContain("gray");
    expect(prompt).toContain("pants");
  });

  it("does not positively describe garments that were not selected", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    // "navy" was the jacket's color -- must not leak in when no jacket is selected.
    expect(prompt.toLowerCase()).not.toContain("navy");
  });

  it("instructs preservation of color, pattern, and construction", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("preserve");
  });

  it("instructs against inventing unselected clothing/accessories, colors, or logos", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("do not add any clothing or accessories that are not explicitly selected");
    expect(prompt.toLowerCase()).toContain("do not change the garment colors");
    expect(prompt.toLowerCase()).toContain("do not invent logos");
  });

  it("requests a photorealistic male model with neutral background", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("male model");
    expect(prompt.toLowerCase()).toContain("photorealistic");
  });

  it("instructs a single output photograph with no visible reference images or collage layout (regression: the multi-image Kontext model composited the reference garment photos into the output alongside the model)", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
    expect(prompt).toContain("single, complete photograph containing only the model");
    expect(prompt).toContain("do not include them, or any crop, thumbnail, or cutout of them");
    expect(prompt).toContain("do not create a collage, grid, side-by-side comparison, or moodboard");
    expect(prompt).toContain("no collage, no visible reference images, no other panels or frames");
  });

  describe("critical composition-lock rule (regression: a real generation showed the model plus a separate inset photo of a person and a separate floating garment cutout in the same output image, despite the existing single-photograph instructions above)", () => {
    it("leads every prompt with the critical composition rule, regardless of which garments are selected", () => {
      const withOuterwear = buildVisualizationPrompt([jacket, shirt, pants]);
      const singleGarment = buildVisualizationPrompt([shirt]);
      for (const prompt of [withOuterwear, singleGarment]) {
        expect(prompt.indexOf("CRITICAL COMPOSITION RULE")).toBe(0);
        expect(prompt).toContain("exactly one single photograph containing exactly one person");
        expect(prompt.toLowerCase()).toContain("do not include any additional inset photo, thumbnail, insert, corner panel");
        expect(prompt.toLowerCase()).toContain("do not include any floating, cut-out, or isolated product photo of a garment");
        expect(prompt.toLowerCase()).toContain("collage, grid, moodboard, split-screen, side-by-side comparison");
      }
    });
  });

  describe("dynamic negative constraints", () => {
    it("excludes known accessories not present in any selected garment", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).toContain("do not add a tie");
      expect(prompt).toContain("do not add a pocket square");
      expect(prompt).toContain("do not add a vest");
      expect(prompt).toContain("do not add a sweater");
    });

    // Unlike the other accessories above, a belt gets a positive styling
    // instruction instead of a suppression -- see the "belt styling" suite.
    it("never suppresses the belt, even when no bottom is selected", () => {
      const prompt = buildVisualizationPrompt([shirt]).toLowerCase();
      expect(prompt).not.toContain("do not add a belt");
    });

    it("does not warn against a garment slot that was actually selected", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).not.toContain("do not add a jacket or other outerwear");
      expect(prompt).not.toContain("do not add a shirt or other top");
      expect(prompt).not.toContain("do not add pants or other bottoms");
    });

    it("warns against unselected garment slots", () => {
      const prompt = buildVisualizationPrompt([shirt]).toLowerCase();
      expect(prompt).toContain("do not add a jacket or other outerwear");
      expect(prompt).toContain("do not add pants or other bottoms");
    });

    it("does not prohibit inherent construction details of selected garments", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).not.toContain("do not add button");
      expect(prompt).not.toContain("do not add pocket");
      expect(prompt).not.toContain("do not add lapel");
      expect(prompt).not.toContain("do not add collar");
    });
  });

  describe("PROMPT_VERSION", () => {
    it("is exported and has been bumped from its pre-category-lock value", () => {
      expect(PROMPT_VERSION).toBeGreaterThan(1);
    });
  });

  describe("category-lock rules", () => {
    const fullZipJacket: OutfitGarmentInput = {
      imageUrl: "https://example.com/full-zip.jpg",
      role: "outerwear",
      category: "outerwear",
      subcategory: "full_zip_jacket",
      primaryColor: "dark green",
      pattern: "solid",
      style: "casual",
    };
    const blazer: OutfitGarmentInput = {
      imageUrl: "https://example.com/blazer.jpg",
      role: "outerwear",
      category: "outerwear",
      subcategory: "blazer",
      primaryColor: "navy",
      pattern: "solid",
      style: "business_formal",
    };
    const dressShirt: OutfitGarmentInput = {
      imageUrl: "https://example.com/dress-shirt.jpg",
      role: "top",
      category: "top",
      subcategory: "dress_shirt",
      primaryColor: "white",
      pattern: "solid",
      style: "business_formal",
    };
    const poloShirt: OutfitGarmentInput = {
      imageUrl: "https://example.com/polo.jpg",
      role: "top",
      category: "top",
      subcategory: "polo_shirt",
      primaryColor: "navy",
      pattern: "solid",
      style: "casual",
    };
    const chinos: OutfitGarmentInput = {
      imageUrl: "https://example.com/chinos.jpg",
      role: "bottom",
      category: "bottom",
      subcategory: "chinos",
      primaryColor: "khaki",
      pattern: "solid",
      style: "smart_casual",
    };
    const suitTrousers: OutfitGarmentInput = {
      imageUrl: "https://example.com/suit-trousers.jpg",
      role: "bottom",
      category: "bottom",
      subcategory: "suit_trousers",
      primaryColor: "charcoal",
      pattern: "solid",
      style: "business_formal",
    };
    const cardigan: OutfitGarmentInput = {
      imageUrl: "https://example.com/cardigan.jpg",
      role: "outerwear",
      category: "outerwear",
      subcategory: "cardigan",
      primaryColor: "gray",
      pattern: "solid",
      style: "smart_casual",
    };

    it("locks a full-zip jacket against becoming a blazer or suit jacket", () => {
      const prompt = buildVisualizationPrompt([fullZipJacket]).toLowerCase();
      expect(prompt).toContain("full-zip jacket");
      expect(prompt).toContain("must remain a full-zip jacket");
      expect(prompt).toContain("do not render this full-zip jacket as a blazer");
      expect(prompt).toContain("do not render this full-zip jacket as a suit jacket");
    });

    it("locks a blazer against becoming a suit jacket", () => {
      const prompt = buildVisualizationPrompt([blazer]).toLowerCase();
      expect(prompt).toContain("must remain a blazer");
      expect(prompt).toContain("do not render this blazer as a suit jacket");
    });

    it("locks a dress shirt against becoming a polo", () => {
      const prompt = buildVisualizationPrompt([dressShirt]).toLowerCase();
      expect(prompt).toContain("must remain a dress shirt");
      expect(prompt).toContain("do not render this dress shirt as a polo shirt");
    });

    it("locks a polo shirt against becoming a t-shirt", () => {
      const prompt = buildVisualizationPrompt([poloShirt]).toLowerCase();
      expect(prompt).toContain("must remain a polo shirt");
      expect(prompt).toContain("do not render this polo shirt as a t-shirt");
    });

    it("locks chinos against becoming suit trousers", () => {
      const prompt = buildVisualizationPrompt([chinos]).toLowerCase();
      expect(prompt).toContain("must remain a chinos");
      expect(prompt).toContain("do not render this chinos as a suit trousers");
    });

    it("locks suit trousers against becoming jeans", () => {
      const prompt = buildVisualizationPrompt([suitTrousers]).toLowerCase();
      expect(prompt).toContain("must remain a suit trousers");
      expect(prompt).toContain("do not render this suit trousers as a jeans");
    });

    it("locks a cardigan against becoming a jacket", () => {
      const prompt = buildVisualizationPrompt([cardigan]).toLowerCase();
      expect(prompt).toContain("must remain a cardigan");
      expect(prompt).toContain("do not render this cardigan as a jacket");
    });

    it("locks a full-zip jacket against becoming a blazer even when the AI analyzer phrases it as 'zip-up jacket' (regression: real analyzer output never matched the old full-phrase key)", () => {
      const realWorldZipJacket: OutfitGarmentInput = {
        imageUrl: "https://example.com/zip-up.jpg",
        role: "outerwear",
        category: "outerwear",
        subcategory: "zip-up jacket",
        primaryColor: "dark brown",
        pattern: "solid",
        style: "smart_casual",
      };
      const prompt = buildVisualizationPrompt([realWorldZipJacket]).toLowerCase();
      expect(prompt).toContain("must remain a full-zip jacket");
      expect(prompt).toContain("do not render this full-zip jacket as a blazer");
      expect(prompt).toContain("do not render this full-zip jacket as a suit jacket");
    });

    it("does not emit identity-lock language for a garment with no matching rule", () => {
      const plainPants: OutfitGarmentInput = {
        imageUrl: "https://example.com/pants.jpg",
        role: "bottom",
        category: "bottom",
        subcategory: "pants",
        primaryColor: "gray",
        pattern: "solid",
        style: "casual",
      };
      const prompt = buildVisualizationPrompt([plainPants]).toLowerCase();
      expect(prompt).not.toContain("must remain a");
    });
  });

  describe("outerwear sleeve-length lock", () => {
    const grayBlazer: OutfitGarmentInput = {
      imageUrl: "https://example.com/blazer.jpg",
      role: "outerwear",
      category: "outerwear",
      subcategory: "blazer",
      primaryColor: "grey",
      pattern: "solid",
      style: "business_casual",
    };
    const shortSleeveShirt: OutfitGarmentInput = {
      imageUrl: "https://example.com/shirt.jpg",
      role: "top",
      category: "top",
      subcategory: "short_sleeve_shirt",
      primaryColor: "navy blue",
      pattern: "solid",
      style: "casual",
    };
    const pants: OutfitGarmentInput = {
      imageUrl: "https://example.com/pants.jpg",
      role: "bottom",
      category: "bottom",
      subcategory: "pants",
      primaryColor: "beige",
      pattern: "solid",
      style: "casual",
    };

    it("locks a blazer to long sleeves even without a captured sleeve visualDetail (regression: a grey blazer paired with a short-sleeve shirt was rendered short-sleeved)", () => {
      const prompt = buildVisualizationPrompt([grayBlazer, shortSleeveShirt, pants]).toLowerCase();
      expect(prompt).toContain("garment 1 (the blazer) is tailored outerwear");
      expect(prompt).toContain("must have long sleeves reaching the wrist");
      expect(prompt).toContain("never short sleeves, cropped sleeves, or rolled-up sleeves");
      expect(prompt).toContain("regardless of the sleeve length of any other garment in this outfit");
    });

    it("does not apply the sleeve-length lock to non-outerwear garments", () => {
      const prompt = buildVisualizationPrompt([shortSleeveShirt, pants]).toLowerCase();
      expect(prompt).not.toContain("is tailored outerwear");
    });

    it("applies the lock to every outerwear garment when more than one is somehow selected", () => {
      const cardigan: OutfitGarmentInput = { ...grayBlazer, subcategory: "cardigan" };
      const prompt = buildVisualizationPrompt([grayBlazer, cardigan]).toLowerCase();
      expect(prompt).toContain("garment 1 (the blazer) is tailored outerwear");
      expect(prompt).toContain("garment 2 (the cardigan) is tailored outerwear");
    });
  });

  describe("short-sleeve-under-outerwear layering consistency", () => {
    const grayBlazer: OutfitGarmentInput = {
      imageUrl: "https://example.com/blazer.jpg",
      role: "outerwear",
      category: "outerwear",
      subcategory: "blazer",
      primaryColor: "grey",
      pattern: "solid",
      style: "business_casual",
    };
    const shortSleeveShirt: OutfitGarmentInput = {
      imageUrl: "https://example.com/shirt.jpg",
      role: "top",
      category: "top",
      subcategory: "short_sleeve_shirt",
      primaryColor: "navy blue",
      pattern: "solid",
      style: "casual",
    };
    const longSleeveShirt: OutfitGarmentInput = {
      imageUrl: "https://example.com/dress-shirt.jpg",
      role: "top",
      category: "top",
      subcategory: "dress_shirt",
      primaryColor: "white",
      pattern: "solid",
      style: "business_formal",
      visualDetails: { sleeve: "long sleeve" },
    };

    it("redirects any cuff-like detail at the jacket's sleeve opening to the jacket's own color instead of the shirt's (strategy pivot after four real generations confirmed FLUX won't stop rendering a cuff-shaped element there outright -- recoloring it to match the jacket removes the visible fidelity error even if the element itself persists)", () => {
      const prompt = buildVisualizationPrompt([grayBlazer, shortSleeveShirt]).toLowerCase();
      expect(prompt).toContain("garment 2 (the short sleeve shirt) has short sleeves ending above the elbow");
      expect(prompt).toContain("must be the exact same grey color and fabric as garment 1 itself");
      expect(prompt).toContain("never the color of garment 2");
      expect(prompt).toContain("keep its own correct navy blue color");
      // Reinforced a second time among the negative constraints, mirroring
      // the redundancy already used for other high-error-rate constraints.
      expect(prompt).toContain("if the sleeve opening of garment 1 shows any cuff-like detail, it must be grey to match garment 1");
      expect(prompt).toContain("never garment 2's color");
    });

    it("does not fire when the top underneath is already long-sleeved", () => {
      const prompt = buildVisualizationPrompt([grayBlazer, longSleeveShirt]).toLowerCase();
      expect(prompt).not.toContain("ending above the elbow");
    });

    it("does not fire when no outerwear is selected at all", () => {
      const prompt = buildVisualizationPrompt([shortSleeveShirt]).toLowerCase();
      expect(prompt).not.toContain("ending above the elbow");
    });

    it("detects a short sleeve via the AI-captured visualDetail even when the subcategory text doesn't say 'short'", () => {
      const shirtWithShortSleeveDetail: OutfitGarmentInput = {
        ...longSleeveShirt,
        subcategory: "button-up shirt",
        visualDetails: { sleeve: "short sleeve" },
      };
      const prompt = buildVisualizationPrompt([grayBlazer, shirtWithShortSleeveDetail]).toLowerCase();
      expect(prompt).toContain("ending above the elbow");
    });
  });

  describe("critical garment-fidelity rule (outerwear + short-sleeve top)", () => {
    const grayBlazer: OutfitGarmentInput = {
      imageUrl: "https://example.com/blazer.jpg",
      role: "outerwear",
      category: "outerwear",
      subcategory: "blazer",
      primaryColor: "grey",
      pattern: "solid",
      style: "business_casual",
    };
    const shortSleeveShirt: OutfitGarmentInput = {
      imageUrl: "https://example.com/shirt.jpg",
      role: "top",
      category: "top",
      subcategory: "short_sleeve_shirt",
      primaryColor: "navy blue",
      pattern: "solid",
      style: "casual",
    };
    const longSleeveShirt: OutfitGarmentInput = {
      imageUrl: "https://example.com/dress-shirt.jpg",
      role: "top",
      category: "top",
      subcategory: "dress_shirt",
      primaryColor: "white",
      pattern: "solid",
      style: "business_formal",
      visualDetails: { sleeve: "long sleeve" },
    };

    it("leads the prompt with the critical garment-fidelity rule block when outerwear and a short-sleeve top are both selected", () => {
      const prompt = buildVisualizationPrompt([grayBlazer, shortSleeveShirt]);
      expect(prompt).toContain("CRITICAL OUTFIT GENERATION RULE -- PRESERVE THE ACTUAL SELECTED GARMENTS:");
      expect(prompt).toContain("NEVER change the sleeve length of a garment because of another selected garment");
      expect(prompt).toContain(
        "PRIORITY RULE: Garment fidelity is more important than fashion interpretation, visual creativity, or aesthetic improvement."
      );
      // The always-present composition-lock block leads the prompt; this
      // block must come right after it, still ahead of general task framing.
      expect(prompt.indexOf("CRITICAL COMPOSITION RULE")).toBe(0);
      expect(prompt.indexOf("CRITICAL OUTFIT GENERATION RULE")).toBeGreaterThan(0);
      expect(prompt.indexOf("CRITICAL OUTFIT GENERATION RULE")).toBeLessThan(
        prompt.indexOf("Photorealistic professional male model")
      );
    });

    it("does not add the block when the top underneath is long-sleeved", () => {
      const prompt = buildVisualizationPrompt([grayBlazer, longSleeveShirt]);
      expect(prompt).not.toContain("CRITICAL OUTFIT GENERATION RULE");
    });

    it("does not add the block when no outerwear is selected", () => {
      const prompt = buildVisualizationPrompt([shortSleeveShirt]);
      expect(prompt).not.toContain("CRITICAL OUTFIT GENERATION RULE");
    });
  });

  describe("color, pattern, and silhouette fidelity", () => {
    it("adds an exact hex-anchored color line when primaryColorHex is provided", () => {
      const withHex: OutfitGarmentInput = { ...shirt, primaryColorHex: "#1B2A4A" };
      const prompt = buildVisualizationPrompt([withHex]);
      expect(prompt).toContain("#1B2A4A");
      expect(prompt.toLowerCase()).toContain("match this exact hue");
    });

    it("does not add a hex-anchored line when no hex is provided", () => {
      const prompt = buildVisualizationPrompt([shirt]).toLowerCase();
      expect(prompt).not.toContain("match this exact hue");
    });

    it("adds a pattern-preservation line for a non-solid pattern", () => {
      const striped: OutfitGarmentInput = { ...shirt, pattern: "striped" };
      const prompt = buildVisualizationPrompt([striped]).toLowerCase();
      expect(prompt).toContain("striped");
      expect(prompt).toContain("do not substitute a different pattern");
    });

    it("does not add a pattern-preservation line for a solid garment", () => {
      const prompt = buildVisualizationPrompt([shirt]).toLowerCase();
      expect(prompt).not.toContain("do not substitute a different pattern");
    });

    it("surfaces visualDetails as preserve-exactly construction lines", () => {
      const withDetails: OutfitGarmentInput = {
        ...shirt,
        visualDetails: { collar: "spread collar", sleeve: "long sleeve, barrel cuff" },
      };
      const prompt = buildVisualizationPrompt([withDetails]).toLowerCase();
      expect(prompt).toContain("collar: spread collar -- preserve exactly");
      expect(prompt).toContain("sleeve: long sleeve, barrel cuff -- preserve exactly");
    });

    it("attributes construction details to a specific garment by number and name so multiple garments' details aren't cross-applied (regression: a blazer's sleeve length was cross-applied from an adjacent short-sleeve shirt in production)", () => {
      const blazerWithDetails: OutfitGarmentInput = {
        imageUrl: "https://example.com/blazer.jpg",
        role: "outerwear",
        category: "outerwear",
        subcategory: "blazer",
        primaryColor: "grey",
        pattern: "solid",
        style: "business_casual",
        visualDetails: { lapel: "notch lapel", sleeve: "long sleeve" },
      };
      const shortSleeveShirt: OutfitGarmentInput = {
        ...shirt,
        subcategory: "short_sleeve_shirt",
        visualDetails: { collar: "spread collar", sleeve: "short sleeve" },
      };
      const prompt = buildVisualizationPrompt([blazerWithDetails, shortSleeveShirt]).toLowerCase();
      expect(prompt).toContain("garment 1 (the blazer) construction details:");
      expect(prompt).toContain("garment 2 (the short sleeve shirt) construction details:");
      // Each sleeve line must be scoped to its own garment, not left as a
      // bare, unattributed "sleeve: X" line that could apply to either.
      expect(prompt).not.toMatch(/^sleeve:/m);
    });

    it("surfaces a silhouette detail as its own preserve-exactly line", () => {
      const withSilhouette: OutfitGarmentInput = { ...shirt, visualDetails: { silhouette: "slim fit" } };
      const prompt = buildVisualizationPrompt([withSilhouette]).toLowerCase();
      expect(prompt).toContain("silhouette: slim fit -- preserve exactly");
    });

    it("always includes the generic fit-preservation line even with no visualDetails", () => {
      const prompt = buildVisualizationPrompt([shirt]).toLowerCase();
      expect(prompt).toContain("do not slim, loosen, lengthen, shorten, or otherwise resize");
    });
  });

  describe("belt styling", () => {
    it("adds a belt-styling line when a bottom garment is selected", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).toContain("add a slim black leather dress belt with a simple, understated buckle");
      expect(prompt).toContain("worn through the belt loops of the pants/trousers");
      expect(prompt).toContain("do not crop the shot at or above the waist");
    });

    it("does not add a belt-styling line when no bottom garment is selected", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt]).toLowerCase();
      expect(prompt).not.toContain("leather belt");
      expect(prompt).not.toContain("leather dress belt");
    });

    it("uses a black belt for cool/neutral-toned pants", () => {
      const navyPants: OutfitGarmentInput = { ...pants, primaryColor: "navy" };
      const prompt = buildVisualizationPrompt([navyPants]).toLowerCase();
      expect(prompt).toContain("add a slim black leather");
    });

    it("uses a brown belt for warm-toned pants", () => {
      const khakiPants: OutfitGarmentInput = { ...pants, primaryColor: "khaki" };
      const prompt = buildVisualizationPrompt([khakiPants]).toLowerCase();
      expect(prompt).toContain("add a slim brown leather");
    });

    it("uses a slim dress belt for a business-formal or business-casual outfit", () => {
      const prompt = buildVisualizationPrompt([{ ...pants, style: "business_casual" }]).toLowerCase();
      expect(prompt).toContain("slim");
      expect(prompt).toContain("dress belt");
    });

    it("uses a relaxed belt (not a dress belt) for a casual outfit", () => {
      const casualPants: OutfitGarmentInput = { ...pants, style: "casual" };
      const prompt = buildVisualizationPrompt([casualPants]).toLowerCase();
      expect(prompt).toContain("leather belt with a simple buckle");
      expect(prompt).not.toContain("dress belt");
    });

    it("instructs the jacket to be open, the buckle centered, and the shirt tucked in when outerwear and a bottom are both selected (regression: real generations showed a closed jacket hides the belt, then -- after fixing that -- an untucked shirt hem independently hid it too)", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).toContain("worn open and unbuttoned at the front");
      expect(prompt).toContain("a closed jacket would hide the belt added above");
      expect(prompt).toContain("belt buckle must be positioned at the center front of the waistline");
      expect(prompt).toContain("gap between the open jacket's two front panels");
      expect(prompt).toContain("must be tucked into the pants/trousers");
    });

    it("does not add the open-jacket instruction when no outerwear is selected", () => {
      const prompt = buildVisualizationPrompt([shirt, pants]).toLowerCase();
      expect(prompt).not.toContain("worn open and unbuttoned");
    });

    it("does not add the open-jacket instruction when outerwear is selected but no bottom is (no belt line to protect)", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt]).toLowerCase();
      expect(prompt).not.toContain("worn open and unbuttoned");
    });
  });

  describe("occasion / style-context direction", () => {
    it("adds no occasion section when no context is passed", () => {
      const prompt = buildVisualizationPrompt([shirt]).toLowerCase();
      expect(prompt).not.toContain("styling context");
    });

    it("adds a styling-context line and the category-change guard when context is passed", () => {
      const prompt = buildVisualizationPrompt([shirt], { occasion: "OFFICE", styleContext: "CLASSIC" }).toLowerCase();
      expect(prompt).toContain("styling context: office, classic");
      expect(prompt).toContain("must never change any garment's category, color, or pattern");
    });
  });
});
