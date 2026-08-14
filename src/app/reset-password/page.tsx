import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A single check covers every bad-link case (expired, already used,
  // invalid, or never went through the recovery flow at all) -- there's no
  // authenticated session at this point in any of them, so there's nothing
  // to parse out of a Supabase error message.
  if (!user || error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Link expired</h1>
        <p className="text-sm text-neutral-500">
          This password reset link is invalid or has expired. Please request a new one.
        </p>
        <Link href="/forgot-password" className="text-sm font-medium text-neutral-900 underline">
          Request a new reset link
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">Set a new password</h1>
      </div>

      <ResetPasswordForm />
    </main>
  );
}
