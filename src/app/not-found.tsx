import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 text-center animate-materialize">
      <p className="font-display text-sm uppercase tracking-widest text-ink-muted">404</p>
      <h1 className="font-display text-3xl font-medium text-ink">Page not found</h1>
      <p className="text-sm text-ink-secondary">
        The page you&apos;re looking for doesn&apos;t exist, or you may not have access to it.
      </p>
      <Link
        href="/dashboard"
        className="text-sm font-medium text-ink underline underline-offset-2 transition-colors duration-150 ease-out hover:text-accent"
      >
        Back to your account
      </Link>
    </main>
  );
}
