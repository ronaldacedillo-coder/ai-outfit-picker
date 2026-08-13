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

  describe("dynamic negative constraints", () => {
    it("excludes known accessories not present in any selected garment", () => {
      const prompt = buildVisualizationPrompt([jacket, shirt, pants]).toLowerCase();
      expect(prompt).toContain("do not add a tie");
      expect(prompt).toContain("do not add a pocket square");
      expect(prompt).toContain("do not add a belt");
      expect(prompt).toContain("do not add a vest");
      expect(prompt).toContain("do not add a sweater");
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
});
