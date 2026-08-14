import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// `next` is an attacker-controllable query param (it rides along on a link
// Supabase emails out), and naively concatenating it into `${origin}${next}`
// is an open redirect: `next=@evil.com` resolves to host "evil.com" (the URL
// userinfo trick), and `next=//evil.com` is a protocol-relative redirect.
// Only same-origin absolute paths are allowed through.
export function safeNextPath(next: string | null): string {
  if (next && /^\/(?!\/|\\)/.test(next)) return next;
  return "/dashboard";
}

// Handles the redirect from Supabase's email confirmation / magic link.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // A failed exchange on a password-recovery link should land on
  // /reset-password's own friendly "invalid or expired" state, not the
  // signup-flavored message below -- every other `next` keeps the existing
  // fallback untouched.
  if (next === "/reset-password") {
    return NextResponse.redirect(`${origin}/reset-password?error=invalid_link`);
  }

  return NextResponse.redirect(`${origin}/login?error=Could not confirm email`);
}
