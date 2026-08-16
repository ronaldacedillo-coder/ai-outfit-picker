import Link from "next/link";
import { listLooks } from "@/app/dashboard/outfit-history-actions";
import { LookGrid } from "@/components/looks/LookGrid";

export const dynamic = "force-dynamic";

export default async function MyLooksPage() {
  const result = await listLooks();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-16">
      <div>
        <Link href="/dashboard" className="text-sm text-ink-secondary underline underline-offset-2">
          ← Back to My Wardrobe
        </Link>
        <h1 className="mt-2 font-display text-2xl font-medium text-ink">My Looks</h1>
      </div>

      {"error" in result ? (
        <p className="rounded-md bg-danger-surface px-4 py-3 text-sm text-danger">{result.error}</p>
      ) : (
        <LookGrid looks={result.data.looks} />
      )}
    </main>
  );
}
