import { describe, it, expect } from "vitest";
import { buildVisualizationPrompt } from "@/lib/outfit/buildVisualizationPrompt";
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

  it("does not mention garments that were not selected", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).not.toContain("jacket");
    expect(prompt.toLowerCase()).not.toContain("navy");
  });

  it("instructs preservation of color, pattern, and construction", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("preserve");
  });

  it("instructs against inventing accessories, colors, or logos", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("do not add accessories");
    expect(prompt.toLowerCase()).toContain("do not change the garment colors");
    expect(prompt.toLowerCase()).toContain("do not invent logos");
  });

  it("requests a photorealistic male model with neutral background", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("male model");
    expect(prompt.toLowerCase()).toContain("photorealistic");
  });
});
