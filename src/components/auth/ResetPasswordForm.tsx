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
        <h2 className="text-lg font-semibold">Password updated successfully.</h2>
        {/* Signs out (and redirects to /login) only now, once the success
            message has already rendered client-side -- see the comment on
            updatePassword for why signing out inside the action itself
            would clobber this view before it ever showed. */}
        <form action={signOut}>
          <button type="submit" className="text-sm font-medium text-neutral-900 underline">
            Return to Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && "error" in state && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
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
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
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
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {mismatch && <p className="text-xs text-red-600">Passwords do not match.</p>}
      </div>

      <button
        type="submit"
        disabled={pending || mismatch}
        className="mt-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
