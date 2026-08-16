"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T } | { error: string };

// Derives the request's own origin instead of hardcoding a domain, so the
// password-reset redirect works in dev and production alike -- mirrors how
// src/app/auth/callback/route.ts reads `origin` off the incoming request,
// adapted for a Server Action, which doesn't get a `request` object.
async function getOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// Not exported: a "use server" file may only export async functions, so
// this stays private and tests assert against the literal string instead.
const NEUTRAL_RESET_MESSAGE =
  "If an account exists for that email address, we've sent instructions to reset your password.";

// Unlike login/signup/signOut above, this returns {data}|{error} instead of
// calling redirect() -- it needs to be directly callable from integration
// tests (matching why the dashboard actions in dashboard/actions.ts use the
// same shape) and it pairs with useActionState on the client.
export async function requestPasswordReset(
  _prevState: ActionResult<{ message: string }> | null,
  formData: FormData,
  injectedClient?: SupabaseClient,
  injectedOrigin?: string
): Promise<ActionResult<{ message: string }>> {
  const parsed = z.string().trim().email().safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = injectedClient ?? (await createClient());
  const origin = injectedOrigin ?? (await getOrigin());

  // Deliberately ignore both the data and error Supabase returns here.
  // resetPasswordForEmail never reports whether the email exists, but even
  // if it did, branching on it would leak account existence -- every
  // format-valid email gets the exact same response.
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  return { data: { message: NEUTRAL_RESET_MESSAGE } };
}

export async function updatePassword(
  _prevState: ActionResult<{ success: true }> | null,
  formData: FormData,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ success: true }>> {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof password !== "string" || typeof confirmPassword !== "string" || !password || !confirmPassword) {
    return { error: "Please fill in both password fields." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = injectedClient ?? (await createClient());
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Couldn't update your password — please request a new reset link." };
  }

  // Deliberately does NOT sign out here. Server Actions trigger an
  // automatic re-render of the invoking page's Server Component tree once
  // they resolve -- /reset-password's page re-checks getUser() at that
  // point, and if the session were already gone, its own "no session ->
  // invalid link" branch would replace the success view before the user
  // ever saw it. Signing out is deferred to the "Return to Login" button
  // (reuses the existing signOut action), so the success message is
  // guaranteed to render first and the user isn't left in an ambiguous
  // authenticated state once they leave this screen.
  return { data: { success: true } };
}
