import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";
import { supabaseAnon } from "./supabaseAnon";

export async function createTestUser() {
  const admin = supabaseAdmin();
  const email = `test-${randomUUID()}@example.com`;
  const password = "test-password-123!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
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
