import { describe, it, expect } from "vitest";
import { codeMatches } from "@/lib/auth/signupCode";

describe("codeMatches", () => {
  it("returns true for an exact match", () => {
    expect(codeMatches("secret-code-123", "secret-code-123")).toBe(true);
  });

  it("returns false for a wrong code of the same length", () => {
    expect(codeMatches("secret-code-124", "secret-code-123")).toBe(false);
  });

  it("returns false for a shorter submitted code", () => {
    expect(codeMatches("short", "secret-code-123")).toBe(false);
  });

  it("returns false for a longer submitted code", () => {
    expect(codeMatches("secret-code-123-and-then-some", "secret-code-123")).toBe(false);
  });

  it("returns false for an empty submitted code", () => {
    expect(codeMatches("", "secret-code-123")).toBe(false);
  });
});
