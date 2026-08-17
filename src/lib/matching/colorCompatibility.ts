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

function nameBasedScore(colorA: string, colorB: string): number {
  const a = lookup(colorA);
  const b = lookup(colorB);

  if (!a || !b) return 55; // unrecognized -- neutral-ish default, never zero

  if (a.family === "neutral" || b.family === "neutral") return 90;
  if (a.family === b.family) return a.tone === b.tone ? 95 : 80; // same family, tonal variation
  if (isComplementary(a.family, b.family)) return 78;
  return 55; // unrelated families -- still ranked, not blocked
}

interface Hsl {
  h: number; // 0-360, meaningless (0) for achromatic colors (s === 0)
  s: number; // 0-1
  l: number; // 0-1
}

// Standard hex -> RGB -> HSL conversion. Returns null for anything that
// isn't a well-formed #rgb/#rrggbb string rather than throwing --
// primary_color_hex is free-form AI output, never guaranteed well-formed.
export function hexToHsl(hex: string): Hsl | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let raw = match[1];
  if (raw.length === 3) {
    raw = raw
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l }; // achromatic (gray/black/white)

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}

// Shortest angular distance between two hues, 0-180 (e.g. 350 vs 10 is 20
// apart, not 340 -- the hue wheel wraps around).
export function hueDistance(h1: number, h2: number): number {
  const raw = Math.abs(h1 - h2) % 360;
  return raw > 180 ? 360 - raw : raw;
}

// Real color-wheel harmony from actual hue/lightness, as a smooth curve
// rather than fixed buckets: near-identical or analogous hues (close
// together on the wheel) and near-complementary hues (opposite the wheel)
// both score well; the "awkward" zone around a 90 degree hue distance
// (neither analogous nor complementary -- e.g. blue vs. yellow-green)
// scores lowest, but never punishingly so, matching this module's existing
// "ranking, not prohibition" philosophy. Achromatic colors (gray/black/
// white -- s < 0.08) are excluded from the hue calculation entirely
// (hue is meaningless for them) and scored as an automatic high-harmony
// neutral pairing instead, consistent with nameBasedScore's own
// neutral-scores-high rule.
export function hexHarmonyScore(hexA: string, hexB: string): number | null {
  const a = hexToHsl(hexA);
  const b = hexToHsl(hexB);
  if (!a || !b) return null;

  if (a.s < 0.08 || b.s < 0.08) {
    // At least one side is effectively gray/black/white -- lightness
    // contrast still matters a little (e.g. white shirt + navy jacket
    // reads better than two near-identical grays), but hue harmony
    // doesn't apply.
    const lightnessDelta = Math.abs(a.l - b.l);
    return Math.round(90 + lightnessDelta * 8); // 90-98
  }

  const distance = hueDistance(a.h, b.h); // 0-180
  // cos(2 * distance) peaks (+1) at 0 and 180 degrees, troughs (-1) at 90.
  const wave = Math.cos((distance * Math.PI) / 90);
  const hueScore = 62 + wave * 30; // ranges 32-92, floor lifted below

  const lightnessDelta = Math.abs(a.l - b.l);
  // Small bonus for tonal contrast (a light + dark pairing reads as
  // deliberate, not muddy) -- capped so it can't dominate the hue term.
  const lightnessBonus = Math.min(lightnessDelta * 10, 8);

  return Math.round(Math.max(40, Math.min(100, hueScore + lightnessBonus)));
}

// Blends (never replaces) the curated name-based score with real hue/
// lightness harmony computed from hex, when both garments have a usable
// hex value -- exactly the refinement the original design spec called
// for but never implemented (see docs/superpowers/specs/
// 2026-08-14-outfit-picker-matching-engine-design.md, section 3). Kept
// as a minority weight (30%): the name-based table encodes curated
// menswear pairing knowledge (e.g. navy+brown as a classic combination)
// that isn't always what raw hue math alone would produce, so hex should
// nudge the score, not override domain judgment.
const HEX_REFINEMENT_WEIGHT = 0.3;

export function colorCompatibilityScore(
  colorA: string,
  colorB: string,
  hexA?: string | null,
  hexB?: string | null
): number {
  const baseScore = nameBasedScore(colorA, colorB);

  if (!hexA || !hexB) return baseScore;

  // Named-neutral classification (beige, khaki, tan, grey, charcoal, etc.)
  // is curated domain knowledge -- these are meant to pair with anything
  // regardless of their exact computed hue/saturation, which hexHarmonyScore
  // doesn't know (its own achromatic check only catches near-zero
  // saturation, e.g. true gray, not a warm low-saturation tan). Skip hex
  // refinement entirely when either side is a recognized neutral name, so
  // it can't undercut that already-correct rule. Caught against real
  // catalog data, not assumed: hex refinement was docking real
  // "dark green + beige" and "burgundy + grey" pairings from 90 down into
  // the 75-80 range before this guard was added.
  const entryA = lookup(colorA);
  const entryB = lookup(colorB);
  if (entryA?.family === "neutral" || entryB?.family === "neutral") return baseScore;
  const hexScore = hexHarmonyScore(hexA, hexB);
  if (hexScore === null) return baseScore;

  const blended = baseScore * (1 - HEX_REFINEMENT_WEIGHT) + hexScore * HEX_REFINEMENT_WEIGHT;
  return Math.round(Math.max(0, Math.min(100, blended)));
}
