import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as supabaseServer from "@/lib/supabase/server";
import { GET } from "@/app/auth/callback/route";

function callbackRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/auth/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

// createClient() reads cookies() from next/headers, which requires a real
// Next.js request-rendering context that doesn't exist when calling the
// route handler directly from a test (same constraint noted in
// dashboard/actions.ts -- see safeRevalidatePath). These tests are only
// about the route's own redirect branching on a failed exchange, not
// Supabase's exchange behavior itself, so stubbing createClient (mirroring
// the vi.spyOn pattern already used in outfit-history-actions.test.ts) is
// the right isolation rather than fighting the request-scope requirement.
let createClientSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createClientSpy = vi.spyOn(supabaseServer, "createClient").mockResolvedValue({
    auth: {
      exchangeCodeForSession: async () => ({ error: new Error("invalid code") }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

afterEach(() => {
  createClientSpy.mockRestore();
});

describe("auth callback recovery branch", () => {
  it("redirects a failed recovery exchange to /reset-password with an error flag", async () => {
    const response = await GET(callbackRequest({ code: "not-a-real-code", next: "/reset-password" }));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.get("error")).toBe("invalid_link");
  });

  it("keeps the existing fallback for a failed non-recovery exchange (regression guard)", async () => {
    const response = await GET(callbackRequest({ code: "not-a-real-code" }));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("Could not confirm email");
  });

  it("keeps the existing fallback when a failed exchange targets a different next path", async () => {
    const response = await GET(callbackRequest({ code: "not-a-real-code", next: "/dashboard" }));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });

  // safeNextPath() itself already has direct unit coverage
  // (tests/unit/auth-callback-safe-next.test.ts); these two confirm the
  // protection still holds end-to-end through the actual route handler,
  // specifically for the two variants named in the recovery spec.
  it("does not open-redirect via next=//evil.com even on a successful-looking recovery target", async () => {
    const response = await GET(callbackRequest({ code: "not-a-real-code", next: "//evil.com" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.host).toBe("localhost:3000");
  });

  it("does not open-redirect via next=@evil.com", async () => {
    const response = await GET(callbackRequest({ code: "not-a-real-code", next: "@evil.com" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.host).toBe("localhost:3000");
  });
});
