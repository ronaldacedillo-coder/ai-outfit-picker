import { describe, it, expect } from "vitest";
import { colorCompatibilityScore } from "@/lib/matching/colorCompatibility";

describe("colorCompatibilityScore", () => {
  it("scores a neutral with any color highly", () => {
    expect(colorCompatibilityScore("navy", "white")).toBeGreaterThanOrEqual(85);
    expect(colorCompatibilityScore("charcoal", "burgundy")).toBeGreaterThanOrEqual(85);
  });

  it("recognizes synonyms as the same color family", () => {
    expect(colorCompatibilityScore("navy", "dark blue")).toBeGreaterThanOrEqual(90);
    expect(colorCompatibilityScore("charcoal", "dark gray")).toBeGreaterThanOrEqual(90);
  });

  it("scores analogous colors well", () => {
    expect(colorCompatibilityScore("navy", "light blue")).toBeGreaterThanOrEqual(70);
  });

  it("scores two neutrals highly", () => {
    expect(colorCompatibilityScore("black", "white")).toBeGreaterThanOrEqual(85);
    expect(colorCompatibilityScore("gray", "beige")).toBeGreaterThanOrEqual(70);
  });

  it("never returns zero for an unrelated pair -- ranking, not prohibition", () => {
    expect(colorCompatibilityScore("green", "burgundy")).toBeGreaterThan(0);
  });

  it("handles unrecognized color names without crashing", () => {
    expect(colorCompatibilityScore("mauve", "white")).toBeGreaterThan(0);
    expect(() => colorCompatibilityScore("", "navy")).not.toThrow();
  });
});
