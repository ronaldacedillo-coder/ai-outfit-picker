import { describe, it, expect } from "vitest";
import { buildGarmentFields } from "@/lib/outfit/buildGarmentInput";

describe("buildGarmentFields", () => {
  it("prefers the AI analyzer's own subcategory over the shared DB subcategory row's name (regression: outerwear only has one DB subcategory, 'business_jacket', shared by blazers and full-zip jackets alike)", () => {
    const fields = buildGarmentFields({
      primary_color: "dark brown",
      primary_color_hex: "#282020",
      pattern: "solid",
      style: "smart_casual",
      ai_analysis: { subcategory: "zip-up jacket", visualDetails: { collar: "point collar" } },
      clothing_categories: { name: "outerwear" },
      clothing_subcategories: { name: "business_jacket" },
    });
    expect(fields.subcategory).toBe("zip-up jacket");
  });

  it("falls back to the DB subcategory name when the item has no AI analysis", () => {
    const fields = buildGarmentFields({
      primary_color: "navy",
      primary_color_hex: null,
      pattern: "solid",
      style: "business_formal",
      ai_analysis: null,
      clothing_categories: { name: "outerwear" },
      clothing_subcategories: { name: "business_jacket" },
    });
    expect(fields.subcategory).toBe("business_jacket");
  });

  it("falls back to the DB subcategory name when the AI analysis has no subcategory field", () => {
    const fields = buildGarmentFields({
      primary_color: "navy",
      primary_color_hex: null,
      pattern: "solid",
      style: "business_formal",
      ai_analysis: { visualDetails: { collar: "spread collar" } },
      clothing_categories: { name: "outerwear" },
      clothing_subcategories: { name: "business_jacket" },
    });
    expect(fields.subcategory).toBe("business_jacket");
  });

  it("still surfaces visualDetails from the AI analysis", () => {
    const fields = buildGarmentFields({
      primary_color: "navy",
      primary_color_hex: null,
      pattern: "solid",
      style: "business_formal",
      ai_analysis: { subcategory: "blazer", visualDetails: { lapel: "notch lapel" } },
      clothing_categories: { name: "outerwear" },
      clothing_subcategories: { name: "business_jacket" },
    });
    expect(fields.visualDetails).toEqual({ lapel: "notch lapel" });
  });
});
