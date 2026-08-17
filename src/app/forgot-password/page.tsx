import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { LogoIcon } from "@/components/brand/Logo";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 animate-materialize">
      <LogoIcon size={40} />
      <div>
        <h1 className="font-display text-3xl font-medium text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Enter the email address associated with your account and we&apos;ll
          send you a link to reset your password.
        </p>
      </div>

      <ForgotPasswordForm />
    </main>
  );
}
