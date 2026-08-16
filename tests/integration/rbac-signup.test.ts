import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./helpers/supabaseAdmin";

// Exercises the handle_new_user() trigger (migration 0004) directly at the
// database level, the same way supabase.auth.signUp({ options: { data } })
// populates raw_user_meta_data -- this is deliberately not routed through
// the Next.js signup() server action, which depends on next/headers'
// cookies() and therefore requires a live request context this test harness
// doesn't provide (the same reason login()/signOut() aren't invoked
// directly elsewhere in this suite either). The security-critical behavior
// under test -- does a role in metadata actually land in profiles, and does
// a garbage/missing role safely fall back to CUSTOMER -- lives entirely in
// the trigger, so testing it here is a direct test of the real boundary.

const createdUserIds: string[] = [];

async function createUserWithRole(role?: string) {
  const admin = supabaseAdmin();
  const email = `test-rbac-${randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-123!",
    email_confirm: true,
    user_metadata: role ? { role, display_name: "Test User" } : { display_name: "Test User" },
  });
  if (error || !data.user) throw new Error(`Could not create test user: ${error?.message}`);
  createdUserIds.push(data.user.id);
  return data.user.id;
}

afterEach(async () => {
  const admin = supabaseAdmin();
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop()!;
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe("RBAC signup trigger (handle_new_user)", () => {
  it("assigns ADMIN when role=ADMIN is in signup metadata", async () => {
    const userId = await createUserWithRole("ADMIN");
    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
    expect(profile?.role).toBe("ADMIN");
  });

  it("assigns STORE when role=STORE is in signup metadata", async () => {
    const userId = await createUserWithRole("STORE");
    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
    expect(profile?.role).toBe("STORE");
  });

  it("assigns CUSTOMER when role=CUSTOMER is in signup metadata", async () => {
    const userId = await createUserWithRole("CUSTOMER");
    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
    expect(profile?.role).toBe("CUSTOMER");
  });

  it("falls back to CUSTOMER when no role is present in signup metadata", async () => {
    const userId = await createUserWithRole(undefined);
    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
    expect(profile?.role).toBe("CUSTOMER");
  });

  it("falls back to CUSTOMER when an unrecognized role string is submitted", async () => {
    const userId = await createUserWithRole("SUPERUSER");
    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
    expect(profile?.role).toBe("CUSTOMER");
  });

  it("a self-authenticated user can read only their own profile row, not another user's", async () => {
    const { supabaseAnon } = await import("./helpers/supabaseAnon");
    const admin = supabaseAdmin();

    const emailA = `test-rbac-${randomUUID()}@example.com`;
    const emailB = `test-rbac-${randomUUID()}@example.com`;
    const password = "test-password-123!";

    const { data: dataA, error: errorA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
      user_metadata: { role: "CUSTOMER" },
    });
    const { data: dataB, error: errorB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
      user_metadata: { role: "CUSTOMER" },
    });
    if (errorA || !dataA.user) throw new Error(`Could not create user A: ${errorA?.message}`);
    if (errorB || !dataB.user) throw new Error(`Could not create user B: ${errorB?.message}`);
    const userAId = dataA.user.id;
    const userBId = dataB.user.id;
    createdUserIds.push(userAId, userBId);

    const clientA = supabaseAnon();
    const { error: signInError } = await clientA.auth.signInWithPassword({ email: emailA, password });
    if (signInError) throw new Error(`Could not sign in as user A: ${signInError.message}`);

    const { data: ownProfile } = await clientA.from("profiles").select("id").eq("id", userAId);
    expect(ownProfile).toHaveLength(1);

    const { data: othersProfile } = await clientA.from("profiles").select("id").eq("id", userBId);
    expect(othersProfile).toEqual([]);
  });
});
