import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { requestPasswordReset, updatePassword } from "@/app/login/actions";

// Mirrors the private NEUTRAL_RESET_MESSAGE constant in login/actions.ts --
// not exported, since a "use server" file may only export async functions.
const NEUTRAL_RESET_MESSAGE =
  "If an account exists for that email address, we've sent instructions to reset your password.";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { supabaseAnon } from "./helpers/supabaseAnon";

function emailFormData(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

function passwordFormData(password: string, confirmPassword: string) {
  const fd = new FormData();
  fd.set("password", password);
  fd.set("confirmPassword", confirmPassword);
  return fd;
}

// Establishes a real recovery session (as if the user had clicked the
// emailed link) without needing real email delivery: admin.generateLink
// mints a token the same way Supabase would for a real resetPasswordForEmail
// call, and verifyOtp redeems it -- both are first-class, documented SDK
// methods, not a workaround.
async function createRecoverySession(email: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data) throw new Error(`could not generate recovery link: ${error?.message}`);

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "recovery",
  });
  if (verifyError) throw new Error(`could not verify recovery token: ${verifyError.message}`);

  return client;
}

describe("requestPasswordReset", () => {
  it("returns the neutral message for an existing account", async () => {
    const admin = supabaseAdmin();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: "test-password-123!",
      email_confirm: true,
    });
    if (error || !created.user) throw new Error("could not create test user");

    const result = await requestPasswordReset(null, emailFormData(email), supabaseAnon(), "http://localhost:3000");
    expect("data" in result && result.data.message).toBe(NEUTRAL_RESET_MESSAGE);

    await admin.auth.admin.deleteUser(created.user.id);
  });

  it("returns the exact same neutral message for a nonexistent account (no enumeration)", async () => {
    const email = `test-${crypto.randomUUID()}@example.com`;
    const result = await requestPasswordReset(null, emailFormData(email), supabaseAnon(), "http://localhost:3000");
    expect("data" in result && result.data.message).toBe(NEUTRAL_RESET_MESSAGE);
  });

  it("returns a distinct format error for a malformed email, not the neutral message", async () => {
    const result = await requestPasswordReset(
      null,
      emailFormData("not-an-email"),
      supabaseAnon(),
      "http://localhost:3000"
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).not.toBe(NEUTRAL_RESET_MESSAGE);
    }
  });

  it("returns the same neutral message on an immediate second request for the same email", async () => {
    const email = `test-${crypto.randomUUID()}@example.com`;
    const first = await requestPasswordReset(null, emailFormData(email), supabaseAnon(), "http://localhost:3000");
    const second = await requestPasswordReset(null, emailFormData(email), supabaseAnon(), "http://localhost:3000");
    expect("data" in first && first.data.message).toBe(NEUTRAL_RESET_MESSAGE);
    expect("data" in second && second.data.message).toBe(NEUTRAL_RESET_MESSAGE);
  });
});

describe("updatePassword", () => {
  it("rejects a mismatched confirmation", async () => {
    const admin = supabaseAdmin();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: "original-password-123!",
      email_confirm: true,
    });
    if (error || !created.user) throw new Error("could not create test user");

    const client = await createRecoverySession(email);
    const result = await updatePassword(null, passwordFormData("new-password-123!", "different-123!"), client);
    expect("error" in result).toBe(true);

    await admin.auth.admin.deleteUser(created.user.id);
  });

  it("rejects a too-short password", async () => {
    const admin = supabaseAdmin();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: "original-password-123!",
      email_confirm: true,
    });
    if (error || !created.user) throw new Error("could not create test user");

    const client = await createRecoverySession(email);
    const result = await updatePassword(null, passwordFormData("abc", "abc"), client);
    expect("error" in result).toBe(true);

    await admin.auth.admin.deleteUser(created.user.id);
  });

  it("updates the password via a real recovery session; old password stops working, new one logs in", async () => {
    const admin = supabaseAdmin();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const oldPassword = "original-password-123!";
    const newPassword = "brand-new-password-456!";
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: oldPassword,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error("could not create test user");

    const recoveryClient = await createRecoverySession(email);
    const result = await updatePassword(null, passwordFormData(newPassword, newPassword), recoveryClient);
    expect("data" in result).toBe(true);

    const oldAttempt = await supabaseAnon().auth.signInWithPassword({ email, password: oldPassword });
    expect(oldAttempt.error).not.toBeNull();

    const newAttempt = await supabaseAnon().auth.signInWithPassword({ email, password: newPassword });
    expect(newAttempt.error).toBeNull();

    await admin.auth.admin.deleteUser(created.user.id);
  });

  it("fails safely when there is no session, instead of throwing", async () => {
    const result = await updatePassword(null, passwordFormData("some-password-123!", "some-password-123!"), supabaseAnon());
    expect("error" in result).toBe(true);
  });
});
