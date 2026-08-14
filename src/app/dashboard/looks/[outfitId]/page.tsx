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
        <Link href="/dashboard/looks" className="text-sm text-stone-500 underline">
          ← Back to My Looks
        </Link>
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <div>
        <Link href="/dashboard/looks" className="text-sm text-stone-500 underline">
          ← Back to My Looks
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">{result.data.look.title}</h1>
      </div>
      <LookDetailView look={result.data.look} />
    </main>
  );
}
