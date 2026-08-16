"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/login/actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);

  if (state && "data" in state) {
    return (
      <div className="flex flex-col gap-4 text-center animate-materialize">
        <h2 className="font-display text-xl font-medium text-ink">Check your email</h2>
        <p className="text-sm text-ink-secondary">{state.data.message}</p>
        <Link
          href="/login"
          className="text-sm font-medium text-ink underline underline-offset-2 transition-colors duration-150 ease-out hover:text-accent"
        >
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && "error" in state && (
        <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{state.error}</p>
      )}

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

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-transform duration-100 ease-out hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-ink-secondary">
        <Link
          href="/login"
          className="font-medium text-ink underline underline-offset-2 transition-colors duration-150 ease-out hover:text-accent"
        >
          Back to Login
        </Link>
      </p>
    </form>
  );
}
