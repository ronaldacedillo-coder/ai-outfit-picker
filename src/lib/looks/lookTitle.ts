import type { LookItemSummary } from "./types";

const STYLE_LABEL: Record<string, string> = {
  business_formal: "Business",
  business_casual: "Business Casual",
  smart_casual: "Smart Casual",
  casual: "Casual",
};

function titleCase(text: string): string {
  return text
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function describeItem(item: LookItemSummary): string {
  return `${titleCase(item.primaryColor)} ${titleCase(item.subcategory)}`;
}

// Deterministic, no AI call -- derives a short display title from the
// clothing metadata already stored on the outfit's items.
export function generateLookTitle(items: LookItemSummary[]): string {
  if (items.length === 0) return "Your Look";

  const outerwear = items.find((i) => i.role === "outerwear");
  if (outerwear) {
    const styleLabel = STYLE_LABEL[outerwear.style] ?? "Casual";
    return `${titleCase(outerwear.primaryColor)} ${styleLabel} Look`;
  }

  if (items.length === 1) {
    return `${describeItem(items[0])} Look`;
  }

  return items.slice(0, 2).map(describeItem).join(" + ");
}
