"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signupInputSchema } from "@/lib/validation/signup";
import { codeMatches } from "@/lib/auth/signupCode";

export async function signup(formData: FormData) {
  const parsed = signupInputSchema.safeParse({
    role: formData.get("role"),
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    code: formData.get("code") || undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check your details and try again.";
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }

  const { role, displayName, email, password, code } = parsed.data;

  // The code check happens here, before auth.signUp() is ever called --
  // this is the security boundary the trigger in migration 0004 depends
  // on: it trusts raw_user_meta_data.role unconditionally because nothing
  // reaches signUp() with an ADMIN/STORE role attached unless the correct
  // server-only code was already verified. Never validated client-side,
  // never logged, and the failure message is identical regardless of
  // whether the code was missing, wrong, or the env var isn't configured
  // -- no signal leaks about which.
  if (role === "ADMIN" || role === "STORE") {
    const expected = role === "ADMIN" ? process.env.ADMIN_SIGNUP_CODE : process.env.STORE_SIGNUP_CODE;
    if (!expected || !code || !codeMatches(code, expected)) {
      redirect(`/signup?error=${encodeURIComponent("Invalid signup code.")}`);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, display_name: displayName },
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/signup?check-email=1");
}
