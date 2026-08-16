import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";
import { supabaseAnon } from "./supabaseAnon";

export type TestUserRole = "ADMIN" | "STORE" | "CUSTOMER";

// With no `role` argument, the handle_new_user() trigger (migration 0004)
// falls back to CUSTOMER -- matching every pre-RBAC caller of this helper,
// which never needed a role concept at all before this migration existed.
export async function createTestUser(role?: TestUserRole) {
  const admin = supabaseAdmin();
  const email = `test-${randomUUID()}@example.com`;
  const password = "test-password-123!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: role ? { role } : undefined,
  });
  if (error || !data.user) {
    throw new Error(`Could not create test user: ${error?.message}`);
  }

  const client = supabaseAnon();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Could not sign in test user: ${signInError.message}`);
  }

  return {
    id: data.user.id,
    client,
    async cleanup() {
      await admin.auth.admin.deleteUser(data.user.id);
    },
  };
}
