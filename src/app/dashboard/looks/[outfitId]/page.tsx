import Link from "next/link";
import { getLookDetail } from "@/app/dashboard/outfit-history-actions";
import { LookDetailView } from "@/components/looks/LookDetailView";

export const dynamic = "force-dynamic";

export default async function LookDetailPage({
  params,
}: {
  params: Promise<{ outfitId: string }>;
}) {
  const { outfitId } = await params;
  const result = await getLookDetail(outfitId);

  if ("error" in result) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-6 py-16">
        <Link href="/dashboard/looks" className="text-sm text-ink-secondary underline underline-offset-2">
          ← Back to My Looks
        </Link>
        <p className="rounded-md bg-danger-surface px-4 py-3 text-sm text-danger">{result.error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <div>
        <Link href="/dashboard/looks" className="text-sm text-ink-secondary underline underline-offset-2">
          ← Back to My Looks
        </Link>
        <h1 className="mt-2 font-display text-2xl font-medium text-ink">{result.data.look.title}</h1>
      </div>
      <LookDetailView look={result.data.look} />
    </main>
  );
}
