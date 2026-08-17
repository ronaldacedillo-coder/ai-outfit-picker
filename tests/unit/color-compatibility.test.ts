import { describe, it, expect } from "vitest";
import { colorCompatibilityScore, hexToHsl, hueDistance, hexHarmonyScore } from "@/lib/matching/colorCompatibility";

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

describe("hexToHsl", () => {
  it("parses 6-digit and 3-digit hex, with or without a leading #", () => {
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(hexToHsl("00ff00")).toMatchObject({ h: 120 });
    expect(hexToHsl("#f00")).toEqual(hexToHsl("#ff0000"));
  });

  it("returns h=0, s=0 for achromatic colors (gray/black/white)", () => {
    expect(hexToHsl("#808080")).toEqual({ h: 0, s: 0, l: 0.5019607843137255 });
    expect(hexToHsl("#000000")?.s).toBe(0);
    expect(hexToHsl("#ffffff")?.s).toBe(0);
  });

  it("returns null for malformed input instead of throwing", () => {
    expect(hexToHsl("not-a-color")).toBeNull();
    expect(hexToHsl("#12")).toBeNull();
    expect(() => hexToHsl("")).not.toThrow();
  });
});

describe("hueDistance", () => {
  it("computes the shortest angular distance, wrapping around 360", () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(10, 350)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(90, 90)).toBe(0);
  });
});

describe("hexHarmonyScore", () => {
  it("scores identical hues (analogous, distance 0) highly", () => {
    expect(hexHarmonyScore("#001f3f", "#001f3f")).toBeGreaterThanOrEqual(85);
  });

  it("scores true complementary hues (180 degrees apart) highly", () => {
    // Blue (240) and a true orange (60) are exactly opposite on the wheel.
    expect(hexHarmonyScore("#0000ff", "#ffaa00")).toBeGreaterThanOrEqual(85);
  });

  it("scores the awkward ~90-degree zone lower than analogous or complementary", () => {
    const analogous = hexHarmonyScore("#0000ff", "#3300ff")!;
    const awkward = hexHarmonyScore("#0000ff", "#00ff33")!; // ~90 degrees from blue
    expect(awkward).toBeLessThan(analogous);
    expect(awkward).toBeGreaterThanOrEqual(40); // never punishingly low
  });

  it("treats a gray/black/white side as an automatic high-harmony neutral pairing", () => {
    expect(hexHarmonyScore("#808080", "#ff0000")).toBeGreaterThanOrEqual(85);
  });

  it("returns null when either hex is malformed", () => {
    expect(hexHarmonyScore("nope", "#ffffff")).toBeNull();
  });
});

describe("colorCompatibilityScore with hex refinement", () => {
  it("is identical to the name-based score when hex is omitted (backward compatible)", () => {
    expect(colorCompatibilityScore("navy", "white")).toBe(colorCompatibilityScore("navy", "white", null, null));
  });

  it("refines but does not replace the name-based score when both hexes are present", () => {
    const nameOnly = colorCompatibilityScore("navy", "brown");
    const withHex = colorCompatibilityScore("navy", "brown", "#001f3f", "#5a3825");
    // Blended, not identical, and still a reasonable, bounded score.
    expect(withHex).not.toBe(nameOnly);
    expect(withHex).toBeGreaterThanOrEqual(0);
    expect(withHex).toBeLessThanOrEqual(100);
  });

  it("improves ranking for colors the name palette doesn't recognize at all (e.g. teal, coral)", () => {
    // Neither "teal" nor "coral" is in PALETTE, so the name-based score
    // falls back to the flat unrecognized default (55) for both pairs --
    // hex should still be able to tell a harmonious pair from a clashing
    // one even when the names alone can't.
    const harmonious = colorCompatibilityScore("teal", "coral", "#008080", "#ff6f61"); // near-complementary
    const clashing = colorCompatibilityScore("teal", "olive-ish", "#008080", "#1a8a3a"); // ~90 degrees, awkward zone
    expect(harmonious).toBeGreaterThan(clashing);
  });

  it("falls back to the name-based score when a hex value is malformed", () => {
    const nameOnly = colorCompatibilityScore("navy", "brown");
    expect(colorCompatibilityScore("navy", "brown", "not-a-hex", "#5a3825")).toBe(nameOnly);
  });

  it("never lets hex refinement undercut a named-neutral pairing (regression: caught against real catalog data -- 'dark green + beige' and 'burgundy + grey' both dropped from 90 into the 75-80 range before this guard existed, because their real hex isn't perfectly achromatic even though they're styling neutrals)", () => {
    // Real hex values pulled from the live catalog.
    expect(colorCompatibilityScore("dark green", "beige", "#1a543f", "#d9c9a3")).toBe(
      colorCompatibilityScore("dark green", "beige")
    );
    expect(colorCompatibilityScore("burgundy", "grey", "#6b1f2a", "#8c8c8c")).toBe(
      colorCompatibilityScore("burgundy", "grey")
    );
  });
});
