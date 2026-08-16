import { createHash } from "crypto";

export interface CombinationHashInput {
  clothingItemIds: string[];
  occasion?: string;
  styleContext?: string;
  ruleVersion: number;
  promptVersion: number;
}

// Order-independent (sorted item ids) so the same garments selected in a
// different order still hit the cache. Includes ruleVersion and
// promptVersion so a stale image generated under an old admin matching
// rule or an old prompt template is never served after either changes --
// the hash simply stops matching, and generation runs fresh.
export function computeCombinationHash(input: CombinationHashInput): string {
  const sortedIds = [...input.clothingItemIds].sort().join(",");
  const key = [
    sortedIds,
    input.occasion ?? "",
    input.styleContext ?? "",
    input.ruleVersion,
    input.promptVersion,
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}
