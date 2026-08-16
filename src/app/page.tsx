import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-5xl font-medium tracking-tight text-ink">
        AI Outfit Picker
      </h1>
      <p className="max-w-md text-lg text-ink-secondary">
        My personal AI stylist that knows the clothes I actually own.
      </p>
      <div className="mt-4 flex gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
