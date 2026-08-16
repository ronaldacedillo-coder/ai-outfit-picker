"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generateOutfitVisualization } from "@/app/dashboard/outfit-actions";
import { deleteLook } from "@/app/dashboard/outfit-history-actions";
import { qualityTier, QUALITY_LABEL, QUALITY_BADGE } from "@/components/outfit-picker/matchQuality";
import type { LookDetail } from "@/app/dashboard/outfit-history-actions";

export function LookDetailView({ look }: { look: LookDetail }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateAgain() {
    if (generating) return; // explicit, one-shot -- never triggered by page load or refresh
    setGenerating(true);
    setError(null);

    const result = await generateOutfitVisualization(
      look.items.map((i) => i.id),
      undefined,
      undefined,
      {
        compatibilityScore: look.compatibilityScore ?? undefined,
        scoreBreakdown: look.scoreBreakdown ?? undefined,
        aiExplanation: look.aiExplanation ?? undefined,
      }
    );

    setGenerating(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(`/dashboard/looks/${result.data.outfitId}`);
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteLook(look.id);
    if ("error" in result) {
      setDeleting(false);
      setError(result.error);
      return;
    }
    router.push("/dashboard/looks");
  }

  const tier = look.compatibilityScore !== null ? qualityTier(look.compatibilityScore) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-muted">
        {look.status === "completed" && look.imageSignedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={look.imageSignedUrl} alt={look.title} className="w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
            <p className="text-sm font-medium text-ink-secondary">
              {look.status === "failed" ? "This generation failed." : "This outfit is still generating…"}
            </p>
            {look.status === "failed" && look.generationError && (
              <p className="text-xs text-ink-muted">Something went wrong on our end — no need to worry about the details.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {look.items.map((item) => (
          <Link
            key={item.id}
            href="/dashboard"
            className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-secondary transition-colors duration-150 ease-out hover:bg-border"
          >
            {item.primaryColor} {item.subcategory.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {tier && (
        <div className="flex flex-col gap-2">
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${QUALITY_BADGE[tier]}`}
          >
            {QUALITY_LABEL[tier]}
          </span>
          {look.aiExplanation && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Why this works</h2>
              <p className="mt-1 text-sm text-ink-secondary">{look.aiExplanation}</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-md bg-danger-surface px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/looks"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-transform duration-150 ease-out hover:bg-surface-muted active:scale-[0.97]"
        >
          Back to My Looks
        </Link>
        {look.status !== "processing" && (
          <button
            onClick={handleGenerateAgain}
            disabled={generating}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-transform duration-150 ease-out hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? "Generating…" : look.status === "failed" ? "Retry" : "Generate Again"}
          </button>
        )}
        {confirmingDelete ? (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition-transform duration-150 ease-out hover:bg-danger-surface active:scale-[0.97]"
          >
            {deleting ? "Deleting…" : "Confirm delete"}
          </button>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-danger transition-transform duration-150 ease-out hover:bg-danger-surface active:scale-[0.97]"
          >
            Delete Look
          </button>
        )}
      </div>
    </div>
  );
}
