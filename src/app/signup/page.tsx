import Link from "next/link";
import { signup } from "./actions";
import { RoleSelector } from "./RoleSelector";
import { LogoIcon } from "@/components/brand/Logo";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; "check-email"?: string }>;
}) {
  const params = await searchParams;

  if (params["check-email"]) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center animate-materialize">
        <LogoIcon size={40} />
        <h1 className="font-display text-3xl font-medium text-ink">Check your email</h1>
        <p className="text-sm text-ink-secondary">
          We sent you a confirmation link. Click it to activate your account,
          then log in.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-ink underline underline-offset-2 transition-colors duration-150 ease-out hover:text-accent"
        >
          Back to login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12 animate-materialize">
      <LogoIcon size={40} />
      <div>
        <h1 className="font-display text-3xl font-medium text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Start styling with ARROW.
        </p>
      </div>

      {params.error && (
        <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">
          {params.error}
        </p>
      )}

      <form action={signup} className="flex flex-col gap-4">
        <RoleSelector />

        <div className="flex flex-col gap-1">
          <label htmlFor="displayName" className="text-sm font-medium text-ink">
            Name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-ink">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={6}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-transform duration-100 ease-out hover:bg-accent-hover active:scale-[0.97]"
        >
          Sign up
        </button>
      </form>

      <p className="text-center text-sm text-ink-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-2">
          Log in
        </Link>
      </p>
    </main>
  );
}
