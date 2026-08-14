import { describe, it, expect } from "vitest";
import { generateLookTitle } from "@/lib/looks/lookTitle";
import type { LookItemSummary } from "@/lib/looks/types";

function item(overrides: Partial<LookItemSummary>): LookItemSummary {
  return {
    role: "top",
    subcategory: "long_sleeve_shirt",
    primaryColor: "white",
    style: "business_formal",
    ...overrides,
  };
}

describe("generateLookTitle", () => {
  it("titles a jacket outfit from the outerwear's color and style", () => {
    const items = [
      item({ role: "outerwear", subcategory: "business_jacket", primaryColor: "navy", style: "business_formal" }),
      item({ role: "top", subcategory: "long_sleeve_shirt", primaryColor: "white" }),
      item({ role: "bottom", subcategory: "pants", primaryColor: "gray" }),
    ];
    expect(generateLookTitle(items)).toBe("Navy Business Look");
  });

  it("falls back to item names when there is no outerwear", () => {
    const items = [
      item({ role: "top", subcategory: "long_sleeve_shirt", primaryColor: "white" }),
      item({ role: "bottom", subcategory: "pants", primaryColor: "gray" }),
    ];
    expect(generateLookTitle(items)).toBe("White Long Sleeve Shirt + Gray Pants");
  });

  it("maps casual style to a plain 'Look' label", () => {
    const items = [
      item({ role: "outerwear", subcategory: "denim_jacket", primaryColor: "blue", style: "casual" }),
      item({ role: "top", subcategory: "t_shirt", primaryColor: "black" }),
    ];
    expect(generateLookTitle(items)).toBe("Blue Casual Look");
  });

  it("never throws and returns a non-empty title for a single item", () => {
    const items = [item({ role: "top", subcategory: "long_sleeve_shirt", primaryColor: "white" })];
    expect(() => generateLookTitle(items)).not.toThrow();
    expect(generateLookTitle(items).length).toBeGreaterThan(0);
  });

  it("returns a generic title for an empty item list instead of throwing", () => {
    expect(generateLookTitle([])).toBe("Your Look");
  });
});
