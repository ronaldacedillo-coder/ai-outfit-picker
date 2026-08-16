import { describe, it, expect } from "vitest";
import { pickBestMatchingRule, type ResolvedOverrideRule } from "@/lib/matching/matchingOverrides";

function rule(overrides: Partial<ResolvedOverrideRule>): ResolvedOverrideRule {
  return {
    ruleId: "rule-1",
    matchedGarmentIds: [],
    priority: 0,
    isItemLevel: false,
    hasExactContext: false,
    ...overrides,
  };
}

describe("pickBestMatchingRule", () => {
  it("returns null when no rule matches any garment in the candidate", () => {
    const result = pickBestMatchingRule(["a", "b"], [rule({ matchedGarmentIds: ["c"] })]);
    expect(result).toBeNull();
  });

  it("returns the single matching rule when only one applies", () => {
    const target = rule({ ruleId: "only", matchedGarmentIds: ["b"] });
    const result = pickBestMatchingRule(["a", "b"], [target]);
    expect(result?.ruleId).toBe("only");
  });

  it("prefers an item-level rule over a category-level rule", () => {
    const itemLevel = rule({ ruleId: "item", matchedGarmentIds: ["b"], isItemLevel: true, priority: 0 });
    const categoryLevel = rule({ ruleId: "category", matchedGarmentIds: ["b"], isItemLevel: false, priority: 100 });
    const result = pickBestMatchingRule(["a", "b"], [categoryLevel, itemLevel]);
    expect(result?.ruleId).toBe("item");
  });

  it("prefers higher priority when both rules are the same level", () => {
    const low = rule({ ruleId: "low", matchedGarmentIds: ["b"], priority: 1 });
    const high = rule({ ruleId: "high", matchedGarmentIds: ["b"], priority: 5 });
    const result = pickBestMatchingRule(["a", "b"], [low, high]);
    expect(result?.ruleId).toBe("high");
  });

  it("prefers an exact-context rule over a catch-all rule when level and priority tie", () => {
    const catchAll = rule({ ruleId: "catch-all", matchedGarmentIds: ["b"], hasExactContext: false });
    const exact = rule({ ruleId: "exact", matchedGarmentIds: ["b"], hasExactContext: true });
    const result = pickBestMatchingRule(["a", "b"], [catchAll, exact]);
    expect(result?.ruleId).toBe("exact");
  });

  it("matches when the rule's matched garment is any member of the candidate, not just the first", () => {
    const target = rule({ ruleId: "third", matchedGarmentIds: ["c"] });
    const result = pickBestMatchingRule(["a", "b", "c"], [target]);
    expect(result?.ruleId).toBe("third");
  });
});
