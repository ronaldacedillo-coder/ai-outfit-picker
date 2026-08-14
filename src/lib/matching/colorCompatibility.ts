type Family = "neutral" | "blue" | "red" | "green" | "brown" | "yellow" | "purple";
type Tone = "light" | "medium" | "dark";

interface ColorEntry {
  family: Family;
  tone: Tone;
  aliases: string[];
}

const PALETTE: ColorEntry[] = [
  { family: "neutral", tone: "dark", aliases: ["black"] },
  { family: "neutral", tone: "light", aliases: ["white", "ivory"] },
  { family: "neutral", tone: "medium", aliases: ["gray", "grey"] },
  { family: "neutral", tone: "dark", aliases: ["charcoal", "dark gray", "dark grey"] },
  { family: "blue", tone: "dark", aliases: ["navy", "dark blue", "navy blue"] },
  { family: "blue", tone: "medium", aliases: ["blue", "royal blue"] },
  { family: "blue", tone: "light", aliases: ["light blue", "sky blue", "powder blue"] },
  { family: "neutral", tone: "light", aliases: ["beige", "tan"] },
  { family: "neutral", tone: "light", aliases: ["khaki"] },
  { family: "neutral", tone: "light", aliases: ["cream", "off-white", "offwhite"] },
  { family: "brown", tone: "medium", aliases: ["brown"] },
  { family: "red", tone: "dark", aliases: ["burgundy", "maroon", "wine"] },
  { family: "green", tone: "medium", aliases: ["green"] },
  { family: "green", tone: "dark", aliases: ["olive", "olive green"] },
];

// Complementary/traditionally-paired non-neutral families, beyond same-family.
const COMPLEMENTARY: [Family, Family][] = [
  ["blue", "brown"],
  ["blue", "red"],
  ["green", "brown"],
];

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[\s_-]+/g, "");
}

function lookup(colorName: string): ColorEntry | null {
  const target = normalize(colorName);
  if (!target) return null;
  for (const entry of PALETTE) {
    if (entry.aliases.some((a) => normalize(a) === target)) return entry;
  }
  // loose fallback: substring match, same technique as wardrobe/matchCategory.ts
  for (const entry of PALETTE) {
    if (entry.aliases.some((a) => normalize(a).includes(target) || target.includes(normalize(a)))) {
      return entry;
    }
  }
  return null;
}

function isComplementary(a: Family, b: Family): boolean {
  return COMPLEMENTARY.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function colorCompatibilityScore(colorA: string, colorB: string): number {
  const a = lookup(colorA);
  const b = lookup(colorB);

  if (!a || !b) return 55; // unrecognized -- neutral-ish default, never zero

  if (a.family === "neutral" || b.family === "neutral") return 90;
  if (a.family === b.family) return a.tone === b.tone ? 95 : 80; // same family, tonal variation
  if (isComplementary(a.family, b.family)) return 78;
  return 55; // unrelated families -- still ranked, not blocked
}
