import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/app/auth/callback/route";

describe("safeNextPath", () => {
  it("allows a same-origin absolute path", () => {
    expect(safeNextPath("/dashboard/looks")).toBe("/dashboard/looks");
  });

  it("defaults to /dashboard when next is missing", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
  });

  it("blocks the userinfo open-redirect trick (next=@evil.com resolves host to evil.com)", () => {
    const next = "@evil.com/phish";
    const blocked = safeNextPath(next);
    expect(blocked).toBe("/dashboard");
    // Confirms *why* this must be blocked: naively concatenating the
    // unvalidated value would have redirected off-site.
    expect(new URL(`https://app.example.com${next}`).host).toBe("evil.com");
  });

  it("blocks a protocol-relative redirect", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
  });

  it("blocks a fully-qualified external URL", () => {
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
  });

  it("blocks a backslash variant", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
  });
});
