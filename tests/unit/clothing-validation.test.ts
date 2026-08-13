import { describe, it, expect } from "vitest";
import { clothingAnalysisSchema, clothingItemInputSchema } from "@/lib/validation/clothing";

const validAnalysis = {
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "light blue",
  primaryColorHex: "#a8c8e8",
  secondaryColors: ["white"],
  pattern: "solid",
  style: "business_formal",
  formalityLevel: 4,
  description: "Light blue long-sleeved business shirt.",
  visualDetails: { collar: "spread" },
};

describe("clothingAnalysisSchema", () => {
  it("accepts a valid Gemini response", () => {
    expect(clothingAnalysisSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it("rejects a pattern outside the allowed enum", () => {
    const result = clothingAnalysisSchema.safeParse({ ...validAnalysis, pattern: "sparkly" });
    expect(result.success).toBe(false);
  });

  it("rejects formalityLevel outside 1-5", () => {
    const result = clothingAnalysisSchema.safeParse({ ...validAnalysis, formalityLevel: 9 });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { description, ...rest } = validAnalysis;
    void description;
    expect(clothingAnalysisSchema.safeParse(rest).success).toBe(false);
  });

  it("defaults secondaryColors to an empty array when omitted", () => {
    const { secondaryColors, ...rest } = validAnalysis;
    void secondaryColors;
    const result = clothingAnalysisSchema.safeParse(rest);
    expect(result.success && result.data.secondaryColors).toEqual([]);
  });
});

describe("clothingItemInputSchema", () => {
  const validInput = {
    categoryId: 1,
    subcategoryId: 1,
    imagePath: "user-id/uuid.jpg",
    primaryColor: "light blue",
    secondaryColors: [],
    pattern: "solid",
    style: "business_formal",
    formalityLevel: 4,
    description: "Light blue shirt.",
    userEdited: true,
  };

  it("accepts a valid save payload", () => {
    expect(clothingItemInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects a non-positive categoryId", () => {
    expect(clothingItemInputSchema.safeParse({ ...validInput, categoryId: 0 }).success).toBe(false);
  });

  it("rejects a missing imagePath", () => {
    const { imagePath, ...rest } = validInput;
    void imagePath;
    expect(clothingItemInputSchema.safeParse(rest).success).toBe(false);
  });
});
