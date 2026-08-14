import { describe, it, expect } from "vitest";
import { deriveLookStyle } from "@/lib/looks/lookStyle";
import type { LookItemSummary } from "@/lib/looks/types";

function item(style: string): LookItemSummary {
  return { role: "top", subcategory: "shirt", primaryColor: "white", style };
}

describe("deriveLookStyle", () => {
  it("returns the single style when all items agree", () => {
    expect(deriveLookStyle([item("business_formal"), item("business_formal")])).toBe("business_formal");
  });

  it("returns the most frequent style when items differ", () => {
    expect(deriveLookStyle([item("casual"), item("casual"), item("business_formal")])).toBe("casual");
  });

  it("breaks ties by preferring the more formal style", () => {
    expect(deriveLookStyle([item("casual"), item("business_formal")])).toBe("business_formal");
  });

  it("defaults to casual for an empty item list", () => {
    expect(deriveLookStyle([])).toBe("casual");
  });

  it("ignores unrecognized style values rather than throwing", () => {
    expect(() => deriveLookStyle([item("unknown_style")])).not.toThrow();
  });
});
