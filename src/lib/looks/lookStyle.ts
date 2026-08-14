import type { LookItemSummary } from "./types";

// Matches the wardrobe's style enum (clothing_items.style check constraint).
const STYLE_FORMALITY_ORDER = ["casual", "smart_casual", "business_casual", "business_formal"];

// No new "look style" column -- derived at read time from the mode of the
// outfit's own clothing items, tie-broken toward the more formal style.
export function deriveLookStyle(items: LookItemSummary[]): string {
  if (items.length === 0) return "casual";

  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.style, (counts.get(item.style) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = -1;
  for (const [style, count] of counts) {
    const betterCount = count > bestCount;
    const tie = count === bestCount;
    const moreFormal =
      tie && best !== null && STYLE_FORMALITY_ORDER.indexOf(style) > STYLE_FORMALITY_ORDER.indexOf(best);
    if (betterCount || moreFormal) {
      best = style;
      bestCount = count;
    }
  }

  return best ?? "casual";
}
