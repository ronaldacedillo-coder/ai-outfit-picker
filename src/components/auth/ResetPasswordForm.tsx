"use client";

import { useActionState, useState } from "react";
import { updatePassword, signOut } from "@/app/login/actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  if (state && "data" in state) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h2 className="font-display text-xl font-medium text-ink">Password updated successfully.</h2>
        {/* Signs out (and redirects to /login) only now, once the success
            message has already rendered client-side -- see the comment on
            updatePassword for why signing out inside the action itself
            would clobber this view before it ever showed. */}
        <form action={signOut}>
          <button type="submit" className="text-sm font-medium text-ink underline underline-offset-2">
            Return to Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && "error" in state && (
        <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{state.error}</p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-ink">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {mismatch && <p className="text-xs text-danger">Passwords do not match.</p>}
      </div>

      <button
        type="submit"
        disabled={pending || mismatch}
        className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
