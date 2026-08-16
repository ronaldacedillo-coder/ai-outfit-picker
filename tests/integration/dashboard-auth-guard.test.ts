import { describe, it, expect } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { supabaseAdmin } from "./helpers/supabaseAdmin";

// Exercises the same updateSession() that src/proxy.ts runs on every
// request (Next.js 16 renamed the middleware.ts convention to proxy.ts;
// functionality is identical -- see node_modules/next/dist/docs/.../middleware.md).

function requestFor(path: string, cookieHeader?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

// Signs in via a cookie-backed SSR client (mirrors what the browser does)
// so the resulting cookies are in the exact format updateSession expects,
// rather than the in-memory session createTestUser's plain client produces.
async function signInWithCookies(email: string, password: string) {
  const jar = new Map<string, string>();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value }) => jar.set(name, value)),
      },
    }
  );

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed: ${error.message}`);

  return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
}

// Creates a confirmed test user and returns its request cookie header,
// with a cleanup function to delete the user afterward.
async function createAuthenticatedSession() {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const password = "test-password-123!";
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`could not create test user: ${error?.message}`);

  const cookieHeader = await signInWithCookies(email, password);
  return { cookieHeader, cleanup: () => admin.auth.admin.deleteUser(data.user.id) };
}

describe("dashboard auth guard (proxy.ts -> updateSession)", () => {
  it("redirects an unauthenticated /dashboard request to /login", async () => {
    const response = await updateSession(requestFor("/dashboard"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("redirects an unauthenticated nested /dashboard/* request to /login", async () => {
    const response = await updateSession(requestFor("/dashboard/looks"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("redirects an unauthenticated /catalog request to /login", async () => {
    const response = await updateSession(requestFor("/catalog"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("lets an authenticated request reach /catalog without a redirect (role gating happens at the page level)", async () => {
    const { cookieHeader, cleanup } = await createAuthenticatedSession();
    try {
      const response = await updateSession(requestFor("/catalog", cookieHeader));
      expect(response.headers.get("location")).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("leaves public routes accessible without a session", async () => {
    const response = await updateSession(requestFor("/login"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets an authenticated request reach /dashboard without a redirect", async () => {
    const { cookieHeader, cleanup } = await createAuthenticatedSession();
    try {
      const response = await updateSession(requestFor("/dashboard", cookieHeader));
      expect(response.headers.get("location")).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("redirects an authenticated request away from /login to /dashboard", async () => {
    const { cookieHeader, cleanup } = await createAuthenticatedSession();
    try {
      const response = await updateSession(requestFor("/login", cookieHeader));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/dashboard");
    } finally {
      await cleanup();
    }
  });
});
