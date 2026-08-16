import { describe, it, expect } from "vitest";
import { signupInputSchema } from "@/lib/validation/signup";

const base = {
  displayName: "Jane Dela Cruz",
  email: "jane@example.com",
  password: "password1",
  confirmPassword: "password1",
};

describe("signupInputSchema", () => {
  it("accepts a CUSTOMER signup with no code", () => {
    const result = signupInputSchema.safeParse({ ...base, role: "CUSTOMER" });
    expect(result.success).toBe(true);
  });

  it("rejects an ADMIN signup with no code", () => {
    const result = signupInputSchema.safeParse({ ...base, role: "ADMIN" });
    expect(result.success).toBe(false);
  });

  it("rejects a STORE signup with no code", () => {
    const result = signupInputSchema.safeParse({ ...base, role: "STORE" });
    expect(result.success).toBe(false);
  });

  it("accepts an ADMIN signup with a code present (value checked server-side, not by this schema)", () => {
    const result = signupInputSchema.safeParse({ ...base, role: "ADMIN", code: "whatever" });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched password/confirmPassword", () => {
    const result = signupInputSchema.safeParse({ ...base, role: "CUSTOMER", confirmPassword: "different" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid role value", () => {
    const result = signupInputSchema.safeParse({ ...base, role: "SUPERUSER" });
    expect(result.success).toBe(false);
  });
});
