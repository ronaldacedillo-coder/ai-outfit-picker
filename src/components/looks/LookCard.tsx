import Link from "next/link";
import { qualityTier, QUALITY_LABEL, QUALITY_BADGE } from "@/components/outfit-picker/matchQuality";
import type { LookSummary } from "@/app/dashboard/outfit-history-actions";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function LookCard({ look }: { look: LookSummary }) {
  return (
    <Link
      href={`/dashboard/looks/${look.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow duration-200 ease-out hover:shadow-md"
    >
      <div className="aspect-[3/4] w-full bg-surface-muted">
        {look.status === "completed" && look.imageSignedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={look.imageSignedUrl}
            alt={look.title}
            className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center">
            <span className="text-sm font-medium text-ink-secondary">
              {look.status === "failed" ? "Generation failed" : "Still generating…"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <h3 className="font-display text-sm font-medium text-ink">{look.title}</h3>
        <p className="line-clamp-1 text-xs text-ink-secondary">{look.itemLabels.join(" · ")}</p>

        <div className="mt-1 flex items-center justify-between">
          {look.compatibilityScore !== null ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${QUALITY_BADGE[qualityTier(look.compatibilityScore)]}`}
            >
              {QUALITY_LABEL[qualityTier(look.compatibilityScore)]}
            </span>
          ) : (
            <span />
          )}
          <span className="text-[11px] text-ink-muted">{formatDate(look.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
