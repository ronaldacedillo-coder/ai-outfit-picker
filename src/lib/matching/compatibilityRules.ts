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
