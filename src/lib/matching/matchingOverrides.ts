// Pure precedence logic for admin-curated matching overrides -- resolving
// *which* concrete catalog items a rule refers to (and calling the
// get_applicable_overrides RPC) happens in getOutfitRecommendations.ts,
// which has the Supabase client this logic doesn't need.

export interface ResolvedOverrideRule {
  ruleId: string;
  matchedGarmentIds: string[];
  priority: number;
  isItemLevel: boolean;
  // True when the rule's own occasion AND style_context are both
  // non-null (an exact-context rule), as opposed to a catch-all rule that
  // applies regardless of the requested occasion/style context.
  hasExactContext: boolean;
}

// Given a candidate outfit's garment ids and the rules applicable to the
// selected item, returns the single rule that wins if more than one rule
// would tag this candidate as an admin pick. Precedence: item-level beats
// category-level, then higher priority, then an exact-context rule beats
// a catch-all one. Returns null if no rule applies to this candidate at all.
export function pickBestMatchingRule(
  candidateGarmentIds: string[],
  rules: ResolvedOverrideRule[]
): ResolvedOverrideRule | null {
  const matching = rules.filter((rule) =>
    rule.matchedGarmentIds.some((id) => candidateGarmentIds.includes(id))
  );
  if (matching.length === 0) return null;

  const sorted = [...matching].sort((a, b) => {
    if (a.isItemLevel !== b.isItemLevel) return a.isItemLevel ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.hasExactContext !== b.hasExactContext) return a.hasExactContext ? -1 : 1;
    return 0;
  });

  return sorted[0];
}
