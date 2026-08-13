# Outfit Picker + Matching Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deterministic + AI-assisted outfit recommendations from the user's real wardrobe, with an Outfit Picker UI that hands off to the existing, unmodified FLUX visualization pipeline.

**Architecture:** A pure, Gemini-free `src/lib/matching/` module (color/formality/style/pattern/silhouette compatibility, weighted scoring, outfit composition) does all filtering and ranking. Only the top-K candidates are ever sent to Gemini (via an extended `AIProvider.explainOutfitMatch`) for narrative explanation/conflict-flagging, and only as an optional enhancement — deterministic results always ship even if Gemini fails. `findMatchingOutfits` is a new, DB-write-free server action. `generateOutfitVisualization` gets one new optional parameter; nothing else about it changes.

**Tech Stack:** Existing Next.js/Supabase/Vitest/zod stack. No new dependencies.

## Global Constraints

- Do not modify `FalFluxImageGenProvider`, `buildVisualizationPrompt.ts`, `SupabaseStorageProvider`, reference-image handling, or `FAL_KEY` handling.
- No new DB columns — reuse `outfits.starting_item_id/compatibility_score/score_breakdown/ai_explanation` and `outfit_items.role`.
- `findMatchingOutfits` writes nothing to the database; only `generateOutfitVisualization` does.
- Category/structure validity is a hard pre-filter; color/formality/style/pattern/silhouette are weighted (30/25/20/15/10), documented, adjustable in one place.
- Gemini (`explainOutfitMatch`) is called on top-5 candidates only, never the full wardrobe; must degrade gracefully on failure.
- No real, paid FLUX calls in automated tests — use the existing `injectedImageGen` DI pattern.
- Full spec: `docs/superpowers/specs/2026-08-14-outfit-picker-matching-engine-design.md`.
- **Do not merge to `main`** — stop and report after full verification.

---

## File Structure

**New:**
- `src/lib/matching/types.ts`
- `src/lib/matching/colorCompatibility.ts`
- `src/lib/matching/compatibilityRules.ts`
- `src/lib/matching/candidateScorer.ts`
- `src/lib/matching/outfitComposer.ts`
- `src/lib/matching/aiStylist.ts`
- `src/lib/validation/outfitMatch.ts` (zod schema for Gemini's structured explanation response)
- `src/app/dashboard/matching-actions.ts`
- `src/components/wardrobe/FindOutfitsButton.tsx`
- `src/components/outfit-picker/RecommendationCard.tsx`
- `src/components/outfit-picker/OutfitPickerView.tsx`
- `src/components/outfit-picker/GeneratedOutfitView.tsx`
- `src/app/dashboard/outfit-picker/[itemId]/page.tsx`
- Tests: `tests/unit/color-compatibility.test.ts`, `tests/unit/compatibility-rules.test.ts`, `tests/unit/candidate-scorer.test.ts`, `tests/unit/outfit-composer.test.ts`, `tests/unit/ai-stylist.test.ts`, `tests/integration/matching-actions.test.ts`

**Modified:**
- `src/lib/providers/types.ts` — `AIProvider.explainOutfitMatch` return type
- `src/lib/providers/gemini.ts` — implement `explainOutfitMatch`
- `src/app/dashboard/outfit-actions.ts` — one new optional parameter
- `src/components/wardrobe/ClothingCard.tsx` — add "Find outfits" action
- `tests/integration/rls-isolation.test.ts` — matching isolation case

---

### Task 1: Color compatibility (pure, unit-tested)

**Files:** Create `src/lib/matching/types.ts`, `src/lib/matching/colorCompatibility.ts`; Test `tests/unit/color-compatibility.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/color-compatibility.test.ts
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
```

- [ ] **Step 2: Run and verify failure** — `npm test -- color-compatibility` — FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
// src/lib/matching/types.ts
export interface CandidateGarment {
  id: string;
  role: string; // "outerwear" | "top" | "bottom"
  category: string;
  subcategory: string;
  primaryColor: string;
  primaryColorHex: string | null;
  pattern: string;
  style: string;
  formalityLevel: number;
  visualDetails: Record<string, string> | null;
  imagePath: string;
}

export interface ScoreBreakdown {
  color: number;
  formality: number;
  style: number;
  pattern: number;
  silhouette: number | null; // null when not scored (data absent)
}

export interface OutfitCandidate {
  garments: CandidateGarment[];
  score: number; // 0-100
  scoreBreakdown: ScoreBreakdown;
}
```

```ts
// src/lib/matching/colorCompatibility.ts
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
```

- [ ] **Step 4: Run and verify pass** — `npm test -- color-compatibility`

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/types.ts src/lib/matching/colorCompatibility.ts tests/unit/color-compatibility.test.ts
git commit -m "feat: add deterministic color compatibility scoring"
```

---

### Task 2: Formality/style/pattern/silhouette rules + category structure filter (pure, unit-tested)

**Files:** Create `src/lib/matching/compatibilityRules.ts`; Test `tests/unit/compatibility-rules.test.ts`

**Interfaces:** Consumes `CandidateGarment` (Task 1).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/compatibility-rules.test.ts
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
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement**

```ts
// src/lib/matching/compatibilityRules.ts
const STYLE_ORDER = ["casual", "smart_casual", "business_casual", "business_formal"];

export function formalityScore(a: number, b: number): number {
  const distance = Math.abs(a - b);
  return Math.max(0, 100 - distance * 22);
}

export function styleScore(a: string, b: string): number {
  const ai = STYLE_ORDER.indexOf(a);
  const bi = STYLE_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return 55;
  const distance = Math.abs(ai - bi);
  return Math.max(0, 100 - distance * 22);
}

export function patternScore(a: string, b: string): number {
  const aSolid = a === "solid";
  const bSolid = b === "solid";
  if (aSolid && bSolid) return 100;
  if (aSolid || bSolid) return 80;
  return 45; // two patterns -- lower, never zero
}

export function silhouetteScore(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const normalize = (s: string) => s.toLowerCase().trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 100;
  const compatible = new Set(["slim", "tailored", "regular"]);
  if (compatible.has(na) && compatible.has(nb)) return 75;
  return 55;
}

// Roles are "outerwear" | "top" | "bottom" (matches clothing_categories.name).
// Valid structure: exactly one bottom, exactly one top, outerwear optional.
export function isValidOutfitStructure(roles: string[]): boolean {
  const counts = roles.reduce<Record<string, number>>((acc, r) => {
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
  const tops = counts.top ?? 0;
  const bottoms = counts.bottom ?? 0;
  const outerwear = counts.outerwear ?? 0;
  const others = roles.filter((r) => r !== "top" && r !== "bottom" && r !== "outerwear").length;
  return tops === 1 && bottoms === 1 && outerwear <= 1 && others === 0;
}
```

- [ ] **Step 4: Run and verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/compatibilityRules.ts tests/unit/compatibility-rules.test.ts
git commit -m "feat: add formality/style/pattern/silhouette rules and structure filter"
```

---

### Task 3: Candidate scorer (weighted combination, pure, unit-tested)

**Files:** Create `src/lib/matching/candidateScorer.ts`; Test `tests/unit/candidate-scorer.test.ts`

**Interfaces:** Consumes `CandidateGarment`, `ScoreBreakdown`, `OutfitCandidate` (Task 1), scoring functions (Task 2).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/candidate-scorer.test.ts
import { describe, it, expect } from "vitest";
import { scoreOutfitCandidate } from "@/lib/matching/candidateScorer";
import type { CandidateGarment } from "@/lib/matching/types";

function garment(overrides: Partial<CandidateGarment>): CandidateGarment {
  return {
    id: "id",
    role: "top",
    category: "top",
    subcategory: "long_sleeve_shirt",
    primaryColor: "white",
    primaryColorHex: null,
    pattern: "solid",
    style: "business_formal",
    formalityLevel: 4,
    visualDetails: null,
    imagePath: "path.jpg",
    ...overrides,
  };
}

describe("scoreOutfitCandidate", () => {
  it("scores a coherent business outfit highly", () => {
    const jacket = garment({ role: "outerwear", primaryColor: "navy", formalityLevel: 4, style: "business_formal" });
    const shirt = garment({ role: "top", primaryColor: "white", formalityLevel: 4, style: "business_formal" });
    const pants = garment({ role: "bottom", primaryColor: "charcoal", formalityLevel: 4, style: "business_formal" });
    const result = scoreOutfitCandidate([jacket, shirt, pants]);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.scoreBreakdown.color).toBeGreaterThan(0);
  });

  it("scores a clashing outfit lower than a coherent one", () => {
    const jacket = garment({ role: "outerwear", primaryColor: "navy", formalityLevel: 5, style: "business_formal" });
    const shirt = garment({ role: "top", primaryColor: "green", formalityLevel: 1, style: "casual", pattern: "printed" });
    const pants = garment({ role: "bottom", primaryColor: "burgundy", formalityLevel: 1, style: "casual", pattern: "plaid" });
    const coherentShirt = garment({ role: "top", primaryColor: "white", formalityLevel: 4, style: "business_formal" });
    const coherentPants = garment({ role: "bottom", primaryColor: "charcoal", formalityLevel: 4, style: "business_formal" });

    const clashing = scoreOutfitCandidate([jacket, shirt, pants]);
    const coherent = scoreOutfitCandidate([jacket, coherentShirt, coherentPants]);
    expect(clashing.score).toBeLessThan(coherent.score);
  });

  it("re-normalizes weights when silhouette data is absent instead of penalizing", () => {
    const shirt = garment({ role: "top" });
    const pants = garment({ role: "bottom" });
    const result = scoreOutfitCandidate([shirt, pants]);
    expect(result.scoreBreakdown.silhouette).toBeNull();
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("produces a score between 0 and 100", () => {
    const shirt = garment({ role: "top" });
    const pants = garment({ role: "bottom" });
    const result = scoreOutfitCandidate([shirt, pants]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement**

```ts
// src/lib/matching/candidateScorer.ts
import { colorCompatibilityScore } from "./colorCompatibility";
import { formalityScore, styleScore, patternScore, silhouetteScore } from "./compatibilityRules";
import type { CandidateGarment, OutfitCandidate, ScoreBreakdown } from "./types";

// Documented weights (see design spec section 3): color matters most visually,
// formality next, then style (deliberately correlated with formality in
// today's data -- see spec), pattern, then silhouette (often unavailable).
const WEIGHTS = { color: 30, formality: 25, style: 20, pattern: 15, silhouette: 10 };

function pairwiseAverage(garments: CandidateGarment[], fn: (a: CandidateGarment, b: CandidateGarment) => number): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < garments.length; i++) {
    for (let j = i + 1; j < garments.length; j++) {
      total += fn(garments[i], garments[j]);
      count++;
    }
  }
  return count === 0 ? 100 : total / count;
}

export function scoreOutfitCandidate(garments: CandidateGarment[]): OutfitCandidate {
  const color = pairwiseAverage(garments, (a, b) => colorCompatibilityScore(a.primaryColor, b.primaryColor));
  const formality = pairwiseAverage(garments, (a, b) => formalityScore(a.formalityLevel, b.formalityLevel));
  const style = pairwiseAverage(garments, (a, b) => styleScore(a.style, b.style));
  const pattern = pairwiseAverage(garments, (a, b) => patternScore(a.pattern, b.pattern));

  const silhouetteValues = garments
    .map((g) => g.visualDetails?.silhouette)
    .filter((v): v is string => Boolean(v));
  const silhouette =
    silhouetteValues.length >= 2
      ? pairwiseAverage(garments, (a, b) =>
          silhouetteScore(a.visualDetails?.silhouette, b.visualDetails?.silhouette) ?? 100
        )
      : null;

  const activeWeights = { ...WEIGHTS };
  if (silhouette === null) {
    // Redistribute the silhouette weight proportionally across the rest
    // rather than penalizing candidates that simply lack the data.
    const redistribute = activeWeights.silhouette;
    const remainingTotal = activeWeights.color + activeWeights.formality + activeWeights.style + activeWeights.pattern;
    activeWeights.color += (activeWeights.color / remainingTotal) * redistribute;
    activeWeights.formality += (activeWeights.formality / remainingTotal) * redistribute;
    activeWeights.style += (activeWeights.style / remainingTotal) * redistribute;
    activeWeights.pattern += (activeWeights.pattern / remainingTotal) * redistribute;
    activeWeights.silhouette = 0;
  }

  const totalWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);
  const score =
    (color * activeWeights.color +
      formality * activeWeights.formality +
      style * activeWeights.style +
      pattern * activeWeights.pattern +
      (silhouette ?? 0) * activeWeights.silhouette) /
    totalWeight;

  const scoreBreakdown: ScoreBreakdown = { color, formality, style, pattern, silhouette };

  return { garments, score: Math.round(Math.min(100, Math.max(0, score))), scoreBreakdown };
}
```

- [ ] **Step 4: Run and verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/candidateScorer.ts tests/unit/candidate-scorer.test.ts
git commit -m "feat: add weighted outfit candidate scorer"
```

---

### Task 4: Outfit composer (pure, unit-tested)

**Files:** Create `src/lib/matching/outfitComposer.ts`; Test `tests/unit/outfit-composer.test.ts`

**Interfaces:** Consumes `CandidateGarment`, `isValidOutfitStructure` (Tasks 1-2), `scoreOutfitCandidate` (Task 3).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/outfit-composer.test.ts
import { describe, it, expect } from "vitest";
import { composeOutfitCandidates } from "@/lib/matching/outfitComposer";
import type { CandidateGarment } from "@/lib/matching/types";

function garment(id: string, overrides: Partial<CandidateGarment>): CandidateGarment {
  return {
    id,
    role: "top",
    category: "top",
    subcategory: "long_sleeve_shirt",
    primaryColor: "white",
    primaryColorHex: null,
    pattern: "solid",
    style: "business_formal",
    formalityLevel: 4,
    visualDetails: null,
    imagePath: `${id}.jpg`,
    ...overrides,
  };
}

describe("composeOutfitCandidates", () => {
  const jacket = garment("jacket", { role: "outerwear", primaryColor: "navy" });
  const shirt = garment("shirt", { role: "top", primaryColor: "white" });
  const polo = garment("polo", { role: "top", primaryColor: "beige", subcategory: "polo_shirt" });
  const pants = garment("pants", { role: "bottom", primaryColor: "charcoal" });

  it("always includes the selected item in every candidate", () => {
    const candidates = composeOutfitCandidates(jacket, [shirt, polo, pants, jacket]);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.garments.some((g) => g.id === jacket.id)).toBe(true);
    }
  });

  it("produces only valid structures when the selection is a jacket", () => {
    const candidates = composeOutfitCandidates(jacket, [shirt, polo, pants, jacket]);
    for (const c of candidates) {
      const roles = c.garments.map((g) => g.role);
      expect(roles).toContain("top");
      expect(roles).toContain("bottom");
    }
  });

  it("produces a shirt+pants candidate when the selection is a shirt", () => {
    const candidates = composeOutfitCandidates(shirt, [shirt, jacket, pants]);
    const rolesSets = candidates.map((c) => c.garments.map((g) => g.role).sort().join(","));
    expect(rolesSets).toContain("bottom,top");
  });

  it("returns an empty list when no complementary items exist", () => {
    const candidates = composeOutfitCandidates(jacket, [jacket]);
    expect(candidates).toEqual([]);
  });

  it("ranks the highest-scoring candidate first", () => {
    const candidates = composeOutfitCandidates(jacket, [shirt, polo, pants, jacket]);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });
});
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement**

```ts
// src/lib/matching/outfitComposer.ts
import { isValidOutfitStructure } from "./compatibilityRules";
import { scoreOutfitCandidate } from "./candidateScorer";
import type { CandidateGarment, OutfitCandidate } from "./types";

// Enumerates candidate outfits from the user's wardrobe that (a) always
// include the selected item and (b) form a valid structure (see
// isValidOutfitStructure). Small wardrobes -> small combination counts, so
// a straightforward enumeration is sufficient for the MVP (see spec
// section on performance -- no embeddings/vector search needed yet).
export function composeOutfitCandidates(
  selected: CandidateGarment,
  wardrobe: CandidateGarment[]
): OutfitCandidate[] {
  const others = wardrobe.filter((g) => g.id !== selected.id);
  const tops = others.filter((g) => g.role === "top");
  const bottoms = others.filter((g) => g.role === "bottom");
  const outerwear = others.filter((g) => g.role === "outerwear");

  const combos: CandidateGarment[][] = [];

  if (selected.role === "outerwear") {
    for (const top of tops) {
      for (const bottom of bottoms) {
        combos.push([selected, top, bottom]);
      }
    }
  } else if (selected.role === "top") {
    for (const bottom of bottoms) {
      combos.push([selected, bottom]);
      for (const jacket of outerwear) {
        combos.push([selected, bottom, jacket]);
      }
    }
  } else if (selected.role === "bottom") {
    for (const top of tops) {
      combos.push([selected, top]);
      for (const jacket of outerwear) {
        combos.push([selected, top, jacket]);
      }
    }
  }

  const valid = combos.filter((c) => isValidOutfitStructure(c.map((g) => g.role)));
  const scored = valid.map((c) => scoreOutfitCandidate(c));
  return scored.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run and verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/outfitComposer.ts tests/unit/outfit-composer.test.ts
git commit -m "feat: add outfit composer -- enumerates valid structures from the wardrobe"
```

---

### Task 5: Extend `AIProvider.explainOutfitMatch` + implement in Gemini

**Files:** Modify `src/lib/providers/types.ts`, `src/lib/providers/gemini.ts`; Create `src/lib/validation/outfitMatch.ts`; Test: extend `tests/unit/gemini-provider.test.ts`

- [ ] **Step 1: Add the zod schema**

```ts
// src/lib/validation/outfitMatch.ts
import { z } from "zod";

export const outfitMatchExplanationSchema = z.object({
  explanation: z.string().min(1).max(400),
  conflicts: z.array(z.string().max(200)).max(5).default([]),
  rank: z.number().int().min(1).optional(),
});
export type OutfitMatchExplanation = z.infer<typeof outfitMatchExplanationSchema>;
```

- [ ] **Step 2: Update the interface**

In `src/lib/providers/types.ts`, replace:
```ts
  explainOutfitMatch(input: {
    items: { name: string; role: string }[];
    scoreBreakdown: Record<string, number>;
  }): Promise<string>;
```
with:
```ts
  explainOutfitMatch(input: {
    items: { name: string; role: string }[];
    scoreBreakdown: Record<string, number>;
  }): Promise<{ explanation: string; conflicts: string[]; rank?: number }>;
```

- [ ] **Step 3: Write the failing test (append to `tests/unit/gemini-provider.test.ts`)**

```ts
describe("GeminiAIProvider.explainOutfitMatch", () => {
  it("returns a validated structured explanation", async () => {
    subscribeMock.mockResolvedValue({
      data: undefined,
      requestId: "req",
    });
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify({ explanation: "Clean contrast, formal tone.", conflicts: [], rank: 1 }),
          }),
        },
      };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    const result = await provider.explainOutfitMatch({
      items: [{ name: "navy jacket", role: "outerwear" }, { name: "white shirt", role: "top" }],
      scoreBreakdown: { color: 90, formality: 100 },
    });
    expect(result.explanation).toContain("contrast");
    expect(result.conflicts).toEqual([]);
  });

  it("throws when Gemini's explanation JSON fails validation", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return {
        models: { generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify({}) }) },
      };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(
      provider.explainOutfitMatch({ items: [], scoreBreakdown: {} })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run and verify failure.**

- [ ] **Step 5: Implement in `GeminiAIProvider`**

Replace the existing `explainOutfitMatch` stub with:
```ts
  async explainOutfitMatch(input: {
    items: { name: string; role: string }[];
    scoreBreakdown: Record<string, number>;
  }): Promise<{ explanation: string; conflicts: string[]; rank?: number }> {
    const prompt = `You are a personal styling assistant. Given this candidate outfit and its already-computed compatibility scores, write a concise (1-2 sentence) user-facing explanation of why it works, and list any real styling conflicts (empty array if none). Do not invent facts not implied by the data.

Outfit items: ${JSON.stringify(input.items)}
Computed scores (0-100 each): ${JSON.stringify(input.scoreBreakdown)}

Return JSON: { "explanation": string, "conflicts": string[] }`;

    const result = await this.client.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            explanation: { type: "string" },
            conflicts: { type: "array", items: { type: "string" } },
          },
          required: ["explanation", "conflicts"],
        },
      },
    });

    const raw = result.text;
    if (!raw) throw new Error("Gemini returned an empty response.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Gemini returned invalid JSON.");
    }
    const validated = outfitMatchExplanationSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Gemini explanation failed validation: ${validated.error.message}`);
    }
    return validated.data;
  }
```
Add `import { outfitMatchExplanationSchema } from "@/lib/validation/outfitMatch";` to the top of `gemini.ts`.

- [ ] **Step 6: Run and verify pass; run full unit suite; build.**

```bash
npm test
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/providers/types.ts src/lib/providers/gemini.ts src/lib/validation/outfitMatch.ts tests/unit/gemini-provider.test.ts
git commit -m "feat: implement structured, Zod-validated explainOutfitMatch"
```

---

### Task 6: AI stylist wrapper (optional Gemini enhancement, unit-tested)

**Files:** Create `src/lib/matching/aiStylist.ts`; Test `tests/unit/ai-stylist.test.ts`

**Interfaces:** Consumes `AIProvider` (Task 5), `OutfitCandidate` (Task 1).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/ai-stylist.test.ts
import { describe, it, expect, vi } from "vitest";
import { explainCandidates } from "@/lib/matching/aiStylist";
import type { AIProvider } from "@/lib/providers/types";
import type { OutfitCandidate } from "@/lib/matching/types";
import type { CandidateGarment } from "@/lib/matching/types";

function garment(id: string, role: string): CandidateGarment {
  return {
    id, role, category: role, subcategory: "x", primaryColor: "navy",
    primaryColorHex: null, pattern: "solid", style: "business_formal",
    formalityLevel: 4, visualDetails: null, imagePath: `${id}.jpg`,
  };
}

function candidate(score: number): OutfitCandidate {
  return {
    garments: [garment("a", "top"), garment("b", "bottom")],
    score,
    scoreBreakdown: { color: score, formality: score, style: score, pattern: score, silhouette: null },
  };
}

describe("explainCandidates", () => {
  it("attaches a Gemini explanation to each candidate on success", async () => {
    const ai: AIProvider = {
      analyzeClothingImage: vi.fn(),
      explainOutfitMatch: vi.fn().mockResolvedValue({ explanation: "Great pairing.", conflicts: [] }),
    };
    const result = await explainCandidates([candidate(90)], ai);
    expect(result[0].explanation).toBe("Great pairing.");
    expect(result[0].conflicts).toEqual([]);
  });

  it("falls back to a deterministic explanation when Gemini fails", async () => {
    const ai: AIProvider = {
      analyzeClothingImage: vi.fn(),
      explainOutfitMatch: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    };
    const result = await explainCandidates([candidate(90)], ai);
    expect(result[0].explanation).toBeTruthy();
    expect(result[0].conflicts).toEqual([]);
  });

  it("works with no AI provider at all", async () => {
    const result = await explainCandidates([candidate(45)], undefined);
    expect(result[0].explanation).toBeTruthy();
  });

  it("only processes the top-K candidates", async () => {
    const ai: AIProvider = {
      analyzeClothingImage: vi.fn(),
      explainOutfitMatch: vi.fn().mockResolvedValue({ explanation: "ok", conflicts: [] }),
    };
    const many = Array.from({ length: 10 }, (_, i) => candidate(100 - i));
    await explainCandidates(many, ai, 5);
    expect(ai.explainOutfitMatch).toHaveBeenCalledTimes(5);
  });
});
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement**

```ts
// src/lib/matching/aiStylist.ts
import type { AIProvider } from "@/lib/providers/types";
import type { OutfitCandidate } from "./types";

export interface ExplainedOutfitCandidate extends OutfitCandidate {
  explanation: string;
  conflicts: string[];
}

function deterministicExplanation(candidate: OutfitCandidate): string {
  const { score } = candidate;
  if (score >= 85) return "A well-balanced combination across color and formality.";
  if (score >= 70) return "A solid combination with good overall coordination.";
  return "A workable combination, though not the strongest pairing in your wardrobe.";
}

export async function explainCandidates(
  candidates: OutfitCandidate[],
  ai: AIProvider | undefined,
  topK = 5
): Promise<ExplainedOutfitCandidate[]> {
  const toExplain = candidates.slice(0, topK);
  const rest = candidates.slice(topK);

  const explained = await Promise.all(
    toExplain.map(async (c) => {
      if (!ai) {
        return { ...c, explanation: deterministicExplanation(c), conflicts: [] };
      }
      try {
        const result = await ai.explainOutfitMatch({
          items: c.garments.map((g) => ({ name: `${g.primaryColor} ${g.subcategory}`, role: g.role })),
          scoreBreakdown: {
            color: c.scoreBreakdown.color,
            formality: c.scoreBreakdown.formality,
            style: c.scoreBreakdown.style,
            pattern: c.scoreBreakdown.pattern,
          },
        });
        return { ...c, explanation: result.explanation, conflicts: result.conflicts };
      } catch {
        return { ...c, explanation: deterministicExplanation(c), conflicts: [] };
      }
    })
  );

  const restExplained = rest.map((c) => ({ ...c, explanation: deterministicExplanation(c), conflicts: [] }));
  return [...explained, ...restExplained];
}
```

- [ ] **Step 4: Run and verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/aiStylist.ts tests/unit/ai-stylist.test.ts
git commit -m "feat: add AI stylist wrapper with graceful deterministic fallback"
```

---

### Task 7: `findMatchingOutfits` server action + integration tests + RLS isolation

**Files:** Create `src/app/dashboard/matching-actions.ts`; Test `tests/integration/matching-actions.test.ts`; Modify `tests/integration/rls-isolation.test.ts`

**Interfaces:** Consumes `composeOutfitCandidates` (Task 4), `explainCandidates` (Task 6).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/matching-actions.test.ts
import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { findMatchingOutfits } from "@/app/dashboard/matching-actions";

async function seedItem(userId: string, categoryName: string, subcategoryName: string, color: string, formality: number) {
  const admin = supabaseAdmin();
  const { data: category } = await admin.from("clothing_categories").select("id").eq("name", categoryName).single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", category!.id)
    .eq("name", subcategoryName)
    .single();
  const { data: item } = await admin
    .from("clothing_items")
    .insert({
      user_id: userId,
      image_url: `${userId}/${subcategoryName}-${color}.jpg`,
      category_id: category!.id,
      subcategory_id: subcategory!.id,
      primary_color: color,
      pattern: "solid",
      style: "business_formal",
      formality_level: formality,
      description: `${color} ${subcategoryName}`,
    })
    .select("id")
    .single();
  return item!.id as string;
}

describe("findMatchingOutfits action", () => {
  it("returns ranked candidates that always include the selected item", async () => {
    const user = await createTestUser();
    const jacketId = await seedItem(user.id, "outerwear", "business_jacket", "navy", 4);
    await seedItem(user.id, "top", "long_sleeve_shirt", "white", 4);
    await seedItem(user.id, "bottom", "pants", "charcoal", 4);

    const result = await findMatchingOutfits(jacketId, user.client);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.candidates.length).toBeGreaterThan(0);
    for (const c of result.data.candidates) {
      expect(c.garments.some((g) => g.id === jacketId)).toBe(true);
      expect(c.explanation).toBeTruthy();
    }

    await user.cleanup();
  });

  it("returns a friendly empty result when no complementary items exist", async () => {
    const user = await createTestUser();
    const jacketId = await seedItem(user.id, "outerwear", "business_jacket", "navy", 4);

    const result = await findMatchingOutfits(jacketId, user.client);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.candidates).toEqual([]);

    await user.cleanup();
  });

  it("returns an error for a nonexistent item instead of throwing", async () => {
    const user = await createTestUser();
    const result = await findMatchingOutfits("00000000-0000-0000-0000-000000000000", user.client);
    expect("error" in result).toBe(true);
    await user.cleanup();
  });
});
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement**

```ts
// src/app/dashboard/matching-actions.ts
"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/providers";
import { composeOutfitCandidates } from "@/lib/matching/outfitComposer";
import { explainCandidates, type ExplainedOutfitCandidate } from "@/lib/matching/aiStylist";
import type { AIProvider } from "@/lib/providers/types";
import type { CandidateGarment } from "@/lib/matching/types";

type ActionResult<T> = { data: T } | { error: string };

async function requireUser(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

interface ClothingItemQueryRow {
  id: string;
  image_url: string;
  primary_color: string | null;
  primary_color_hex: string | null;
  pattern: string | null;
  style: string | null;
  formality_level: number | null;
  ai_analysis: { visualDetails?: Record<string, string> } | null;
  clothing_categories: { name: string } | null;
  clothing_subcategories: { name: string } | null;
}

function toCandidateGarment(row: ClothingItemQueryRow): CandidateGarment {
  return {
    id: row.id,
    role: row.clothing_categories?.name ?? "top",
    category: row.clothing_categories?.name ?? "",
    subcategory: row.clothing_subcategories?.name ?? "",
    primaryColor: row.primary_color ?? "",
    primaryColorHex: row.primary_color_hex,
    pattern: row.pattern ?? "solid",
    style: row.style ?? "casual",
    formalityLevel: row.formality_level ?? 3,
    visualDetails: row.ai_analysis?.visualDetails ?? null,
    imagePath: row.image_url,
  };
}

export async function findMatchingOutfits(
  selectedItemId: string,
  injectedClient?: SupabaseClient,
  injectedAI?: AIProvider
): Promise<ActionResult<{ candidates: ExplainedOutfitCandidate[] }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const { data: rows, error } = await supabase
    .from("clothing_items")
    .select(
      "id, image_url, primary_color, primary_color_hex, pattern, style, formality_level, ai_analysis, clothing_categories(name), clothing_subcategories(name)"
    )
    .eq("user_id", user.id);

  if (error || !rows) return { error: "Couldn't load your wardrobe — please try again." };

  const wardrobe = (rows as unknown as ClothingItemQueryRow[]).map(toCandidateGarment);
  const selected = wardrobe.find((g) => g.id === selectedItemId);
  if (!selected) return { error: "That item couldn't be found in your wardrobe." };

  const rawCandidates = composeOutfitCandidates(selected, wardrobe);

  let ai: AIProvider | undefined = injectedAI;
  if (ai === undefined) {
    try {
      ai = getAIProvider();
    } catch {
      ai = undefined; // Gemini not configured -- deterministic recommendations still work.
    }
  }

  const candidates = await explainCandidates(rawCandidates, ai);
  return { data: { candidates } };
}
```

- [ ] **Step 4: Run and verify pass.**

- [ ] **Step 5: Add RLS isolation case (append to `tests/integration/rls-isolation.test.ts`)**

```ts
it("user A cannot get outfit recommendations from user B's wardrobe", async () => {
  const userA = await createTestUser();
  const userB = await createTestUser();
  const admin = supabaseAdmin();

  const { data: category } = await admin.from("clothing_categories").select("id").eq("name", "top").single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", category!.id)
    .limit(1)
    .single();
  const { data: item } = await admin
    .from("clothing_items")
    .insert({
      user_id: userB.id,
      image_url: `${userB.id}/shirt.jpg`,
      category_id: category!.id,
      subcategory_id: subcategory!.id,
      primary_color: "white",
      pattern: "solid",
      style: "business_formal",
      formality_level: 4,
      description: "white shirt",
    })
    .select("id")
    .single();

  const { findMatchingOutfits } = await import("@/app/dashboard/matching-actions");
  const result = await findMatchingOutfits(item!.id, userA.client);
  expect("error" in result).toBe(true);

  await admin.from("clothing_items").delete().eq("id", item!.id);
  await userA.cleanup();
  await userB.cleanup();
});
```

- [ ] **Step 6: Run and verify pass; full suite; lint; build.**

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/matching-actions.ts tests/integration/matching-actions.test.ts tests/integration/rls-isolation.test.ts
git commit -m "feat: add findMatchingOutfits action with RLS isolation test"
```

---

### Task 8: Extend `generateOutfitVisualization` with optional score/explanation persistence

**Files:** Modify `src/app/dashboard/outfit-actions.ts`; extend `tests/integration/outfit-generation-actions.test.ts`

**Constraint:** This is the *only* touch to `outfit-actions.ts`/FLUX-adjacent code in this milestone. FLUX/storage/reference-image logic itself is untouched.

- [ ] **Step 1: Write the failing test (append to existing test file)**

```ts
it("persists score/explanation metadata when provided", async () => {
  const user = await createTestUser();
  const itemId = await seedClothingItem(user.id, "top", "white");

  const result = await generateOutfitVisualization([itemId], user.client, fakeSuccessProvider, {
    compatibilityScore: 87,
    scoreBreakdown: { color: 90, formality: 100, style: 80, pattern: 100, silhouette: null },
    aiExplanation: "Clean, coordinated look.",
  });
  if ("error" in result) throw new Error(result.error);

  const admin = supabaseAdmin();
  const { data: outfit } = await admin.from("outfits").select("*").eq("id", result.data.outfitId).single();
  expect(outfit!.compatibility_score).toBe(87);
  expect(outfit!.ai_explanation).toBe("Clean, coordinated look.");

  await admin.storage.from("clothing-photos").remove([`${user.id}/top.jpg`]);
  await admin.storage.from("outfit-images").remove([outfit!.generated_image_url]);
  await user.cleanup();
});
```

- [ ] **Step 2: Run and verify failure** (new 4th param doesn't exist yet).

- [ ] **Step 3: Implement — add the optional parameter**

In `src/app/dashboard/outfit-actions.ts`, change the signature to:
```ts
export async function generateOutfitVisualization(
  clothingItemIds: string[],
  injectedClient?: SupabaseClient,
  injectedImageGen?: ImageGenProvider,
  matchMetadata?: { compatibilityScore?: number; scoreBreakdown?: Record<string, number | null>; aiExplanation?: string }
): Promise<ActionResult<{ outfitId: string; imageUrl: string }>> {
```
and in the initial insert, spread it in:
```ts
  const { data: outfit, error: insertError } = await supabase
    .from("outfits")
    .insert({
      user_id: user.id,
      generation_status: "processing",
      compatibility_score: matchMetadata?.compatibilityScore ?? null,
      score_breakdown: matchMetadata?.scoreBreakdown ?? null,
      ai_explanation: matchMetadata?.aiExplanation ?? null,
    })
    .select("id")
    .single();
```
Nothing else in the function changes.

- [ ] **Step 4: Run and verify pass; full suite; lint; build.**

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/outfit-actions.ts tests/integration/outfit-generation-actions.test.ts
git commit -m "feat: persist match score/explanation on generateOutfitVisualization

Additive only -- one new optional 4th parameter. FLUX provider,
prompt builder, storage, and reference-image handling are untouched."
```

---

### Task 9: Outfit Picker UI

**Files:** Create `src/components/wardrobe/FindOutfitsButton.tsx`, `src/components/outfit-picker/RecommendationCard.tsx`, `src/components/outfit-picker/OutfitPickerView.tsx`, `src/app/dashboard/outfit-picker/[itemId]/page.tsx`; Modify `src/components/wardrobe/ClothingCard.tsx`

- [ ] **Step 1: Add "Find outfits" to `ClothingCard`**

Add a button/link next to Edit/Delete: `<Link href={`/dashboard/outfit-picker/${item.id}`}>Find outfits</Link>`.

- [ ] **Step 2: Build `OutfitPickerView` (client component)**

Fetches via `findMatchingOutfits` on mount (or receives server-fetched candidates as props from the page), shows the selected item header, then a list of `RecommendationCard`s (thumbnail row, quality label derived from score — 85+ "Excellent match", 70-84 "Very good match", 55-69 "Good match", below "Possible match" — short explanation, "Visualize Outfit" button). Empty state: "We couldn't find a strong match in your wardrobe yet. Try adding more shirts or pants."

- [ ] **Step 3: Wire "Visualize Outfit" to the existing action**

On click, call `generateOutfitVisualization(candidate.garments.map(g => g.id), undefined, undefined, { compatibilityScore: candidate.score, scoreBreakdown: candidate.scoreBreakdown, aiExplanation: candidate.explanation })` (no injected client/provider from the client — the action resolves its own server context). Disable the button during the in-flight request to prevent duplicate-click double generation (the one duplicate-prevention measure in scope per the spec). Show "Creating your outfit... / Generating your AI model... / Your outfit is ready." status text while pending.

- [ ] **Step 4: Build `GeneratedOutfitView`**

Shows the generated image (signed URL, resolved server-side), the selected clothing list, "Back to recommendations," "Try another outfit." No auto-regenerate button.

- [ ] **Step 5: Build and manually verify in the browser**

```bash
npm run build
```
Then start the dev server and manually walk through: select an item → see recommendations with explanations → visualize one → see the generated image. Use a browser session with real seeded wardrobe data (or the existing test items) for this check.

- [ ] **Step 6: Commit**

```bash
git add src/components/wardrobe/FindOutfitsButton.tsx src/components/outfit-picker src/app/dashboard/outfit-picker src/components/wardrobe/ClothingCard.tsx
git commit -m "feat: add Outfit Picker UI wired to matching engine and existing FLUX action"
```

---

### Task 10: Full verification, manual test, report (no merge)

- [ ] **Step 1: Full suite**

```bash
npm test
npm run lint
npm run build
```

- [ ] **Step 2: Manual browser verification** — select an item with at least one valid complementary pair in the wardrobe, confirm recommendations render with plain-language explanations and quality labels (not raw scores), confirm an item with no valid matches shows the friendly empty state, confirm "Visualize Outfit" reuses the existing FLUX action without any duplicate/second generation path, confirm the generated image renders and "Back"/"Try another" work.

- [ ] **Step 3: Report and stop** — changed files, DB changes (none expected beyond what's already reused), tests performed, known limitations. **Do not merge** — wait for explicit approval.

---

## Self-Review

**Spec coverage:** category hard-filter + weighted color/formality/style/pattern/silhouette scoring (Tasks 1-3), outfit composition preserving the selected item (Task 4), Gemini limited to top-K with graceful degradation (Tasks 5-6), ephemeral recommendations / DB-write-free `findMatchingOutfits` (Task 7), one additive extension to `generateOutfitVisualization` and nothing else touched in the FLUX path (Task 8), UI with plain-language quality labels and one-shot generation (Task 9), RLS isolation and mocked-Gemini/mocked-FLUX tests throughout, no merge until approved (Task 10).

**Placeholder scan:** none — every step has real code or an exact command.

**Type consistency:** `CandidateGarment`/`OutfitCandidate`/`ScoreBreakdown` (Task 1) flow unchanged through Tasks 2-9. `ExplainedOutfitCandidate` (Task 6) is the single type returned by `findMatchingOutfits` (Task 7) and consumed by the UI (Task 9).
