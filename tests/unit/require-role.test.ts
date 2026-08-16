import { describe, it, expect } from "vitest";
import { requireRole } from "@/lib/auth/requireRole";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeSupabase(opts: { userId?: string; role?: string; profileError?: boolean }): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user: opts.userId ? { id: opts.userId } : null },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            opts.profileError || !opts.role
              ? { data: null, error: new Error("no profile") }
              : { data: { role: opts.role }, error: null },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("requireRole", () => {
  it("returns null when there is no authenticated user", async () => {
    const supabase = fakeSupabase({});
    const result = await requireRole(supabase, ["ADMIN"]);
    expect(result).toBeNull();
  });

  it("returns null when the user has no profile row", async () => {
    const supabase = fakeSupabase({ userId: "u1", profileError: true });
    const result = await requireRole(supabase, ["ADMIN"]);
    expect(result).toBeNull();
  });

  it("returns null when the caller's role is not in the allowed list", async () => {
    const supabase = fakeSupabase({ userId: "u1", role: "CUSTOMER" });
    const result = await requireRole(supabase, ["ADMIN"]);
    expect(result).toBeNull();
  });

  it("returns the user and role when the role is allowed", async () => {
    const supabase = fakeSupabase({ userId: "u1", role: "ADMIN" });
    const result = await requireRole(supabase, ["ADMIN", "STORE"]);
    expect(result).not.toBeNull();
    expect(result?.role).toBe("ADMIN");
    expect(result?.user.id).toBe("u1");
  });

  it("allows any role in a multi-role allow list", async () => {
    const supabase = fakeSupabase({ userId: "u1", role: "STORE" });
    const result = await requireRole(supabase, ["STORE", "CUSTOMER"]);
    expect(result?.role).toBe("STORE");
  });
});
