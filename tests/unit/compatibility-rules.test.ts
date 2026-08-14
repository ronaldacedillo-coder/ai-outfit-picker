import { describe, it, expect } from "vitest";
import {
  formalityScore,
  styleScore,
  patternScore,
  silhouetteScore,
  isValidOutfitStructure,
} from "@/lib/matching/compatibilityRules";

describe("formalityScore", () => {
  it("scores identical formality levels highest", () => {
    expect(formalityScore(4, 4)).toBe(100);
  });
  it("scores distant formality levels lower, never negative", () => {
    expect(formalityScore(5, 1)).toBeGreaterThanOrEqual(0);
    expect(formalityScore(5, 1)).toBeLessThan(formalityScore(5, 4));
  });
});

describe("styleScore", () => {
  it("scores identical styles highest", () => {
    expect(styleScore("business_formal", "business_formal")).toBe(100);
  });
  it("scores a formal+casual mismatch lower than a formal+formal match", () => {
    expect(styleScore("business_formal", "casual")).toBeLessThan(styleScore("business_formal", "business_casual"));
  });
});

describe("patternScore", () => {
  it("scores solid+solid highest", () => {
    expect(patternScore("solid", "solid")).toBe(100);
  });
  it("scores solid+pattern well", () => {
    expect(patternScore("solid", "striped")).toBeGreaterThanOrEqual(75);
  });
  it("scores pattern+pattern lower but not zero", () => {
    const score = patternScore("striped", "plaid");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(patternScore("solid", "striped"));
  });
});

describe("silhouetteScore", () => {
  it("returns null when either garment lacks silhouette data", () => {
    expect(silhouetteScore(null, "slim")).toBeNull();
    expect(silhouetteScore("slim", null)).toBeNull();
  });
  it("scores matching silhouettes well when both present", () => {
    expect(silhouetteScore("slim", "tailored")).toBeGreaterThanOrEqual(70);
  });
});

describe("isValidOutfitStructure", () => {
  it("accepts jacket + shirt + pants", () => {
    expect(isValidOutfitStructure(["outerwear", "top", "bottom"])).toBe(true);
  });
  it("accepts shirt + pants", () => {
    expect(isValidOutfitStructure(["top", "bottom"])).toBe(true);
  });
  it("rejects a jacket alone", () => {
    expect(isValidOutfitStructure(["outerwear"])).toBe(false);
  });
  it("rejects two tops with no bottom", () => {
    expect(isValidOutfitStructure(["top", "top"])).toBe(false);
  });
  it("rejects a bottom alone", () => {
    expect(isValidOutfitStructure(["bottom"])).toBe(false);
  });
});
