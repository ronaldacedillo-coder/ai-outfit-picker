import { describe, it, expect } from "vitest";
import { computeCombinationHash } from "@/lib/outfit/combinationHash";

const base = { clothingItemIds: ["a", "b", "c"], ruleVersion: 1, promptVersion: 1 };

describe("computeCombinationHash", () => {
  it("produces the same hash for the same input", () => {
    expect(computeCombinationHash(base)).toBe(computeCombinationHash(base));
  });

  it("is independent of the order of clothingItemIds", () => {
    const a = computeCombinationHash({ ...base, clothingItemIds: ["a", "b", "c"] });
    const b = computeCombinationHash({ ...base, clothingItemIds: ["c", "a", "b"] });
    expect(a).toBe(b);
  });

  it("produces a different hash for a different set of items", () => {
    const a = computeCombinationHash({ ...base, clothingItemIds: ["a", "b", "c"] });
    const b = computeCombinationHash({ ...base, clothingItemIds: ["a", "b", "d"] });
    expect(a).not.toBe(b);
  });

  it("produces a different hash for a different occasion", () => {
    const a = computeCombinationHash({ ...base, occasion: "OFFICE" });
    const b = computeCombinationHash({ ...base, occasion: "WEEKEND" });
    expect(a).not.toBe(b);
  });

  it("produces a different hash for a different style context", () => {
    const a = computeCombinationHash({ ...base, styleContext: "CLASSIC" });
    const b = computeCombinationHash({ ...base, styleContext: "MODERN" });
    expect(a).not.toBe(b);
  });

  it("produces a different hash when ruleVersion changes (admin rule change invalidates the cache)", () => {
    const a = computeCombinationHash({ ...base, ruleVersion: 1 });
    const b = computeCombinationHash({ ...base, ruleVersion: 2 });
    expect(a).not.toBe(b);
  });

  it("produces a different hash when promptVersion changes (prompt template change invalidates the cache)", () => {
    const a = computeCombinationHash({ ...base, promptVersion: 1 });
    const b = computeCombinationHash({ ...base, promptVersion: 2 });
    expect(a).not.toBe(b);
  });

  it("does not collide two-item and three-item combinations that share a prefix", () => {
    const a = computeCombinationHash({ ...base, clothingItemIds: ["a", "b"] });
    const b = computeCombinationHash({ ...base, clothingItemIds: ["a", "b", "c"] });
    expect(a).not.toBe(b);
  });
});
