import { describe, it, expect } from "vitest";
import { matchSubcategory, type CategoryOption, type SubcategoryOption } from "@/lib/wardrobe/matchCategory";

const categories: CategoryOption[] = [
  { id: 1, name: "top" },
  { id: 2, name: "bottom" },
  { id: 3, name: "outerwear" },
];
const subcategories: SubcategoryOption[] = [
  { id: 1, categoryId: 1, name: "long_sleeve_shirt" },
  { id: 2, categoryId: 1, name: "short_sleeve_shirt" },
  { id: 3, categoryId: 1, name: "polo_shirt" },
  { id: 4, categoryId: 2, name: "pants" },
  { id: 5, categoryId: 3, name: "business_jacket" },
];

describe("matchSubcategory", () => {
  it("matches an exact slug", () => {
    expect(matchSubcategory(categories, subcategories, "top", "long_sleeve_shirt")).toEqual({
      categoryId: 1,
      subcategoryId: 1,
    });
  });

  it("matches a human-readable variant with different casing/spacing", () => {
    expect(matchSubcategory(categories, subcategories, "Top", "Long-Sleeved Shirt")).toEqual({
      categoryId: 1,
      subcategoryId: 1,
    });
  });

  it("matches polo shirt loosely", () => {
    expect(matchSubcategory(categories, subcategories, "top", "Polo")?.subcategoryId).toBe(3);
  });

  it("falls back to the first subcategory in a matched category when the subcategory text doesn't match", () => {
    expect(matchSubcategory(categories, subcategories, "bottom", "chinos")).toEqual({
      categoryId: 2,
      subcategoryId: 4,
    });
  });

  it("returns null when nothing matches", () => {
    expect(matchSubcategory(categories, subcategories, "footwear", "sneakers")).toBeNull();
  });
});
