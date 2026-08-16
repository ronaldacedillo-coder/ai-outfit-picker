import { qualityTier, QUALITY_LABEL, QUALITY_BADGE, QUALITY_METER_FILL, meterTicksFilled } from "./matchQuality";
import type { DisplayCandidate } from "./types";

const ROLE_ORDER: Record<string, number> = { outerwear: 0, top: 1, bottom: 2 };

// End users never see the word "AI" for a plain deterministic fallback --
// that label is reserved for results that actually came from Gemini, and
// admin-curated combinations get ARROW's own styling-authority framing
// rather than exposing that a rule engine picked them.
const SOURCE_LABEL: Record<"admin_override" | "ai", { text: string; className: string }> = {
  admin_override: { text: "ARROW STYLE PICK", className: "bg-accent/10 text-accent ring-accent/30" },
  ai: { text: "AI STYLE RECOMMENDATION", className: "bg-surface-muted text-ink-secondary ring-border" },
};

export function RecommendationCard({
  candidate,
  onVisualize,
  visualizing,
  disabled,
}: {
  candidate: DisplayCandidate;
  onVisualize: () => void;
  visualizing: boolean;
  disabled: boolean;
}) {
  const tier = qualityTier(candidate.score);
  const filled = meterTicksFilled(candidate.score);
  const garments = [...candidate.garments].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
  );
  const sourceLabel =
    candidate.source === "admin_override" || candidate.source === "ai" ? SOURCE_LABEL[candidate.source] : null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md sm:flex-row sm:items-center">
      <div className="flex gap-2">
        {garments.map((g) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={g.id}
            src={g.imageSignedUrl}
            alt={`${g.primaryColor} ${g.subcategory.replace(/_/g, " ")}`}
            className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-border"
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {sourceLabel && (
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${sourceLabel.className}`}
          >
            {sourceLabel.text}
          </span>
        )}
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${QUALITY_BADGE[tier]}`}
          >
            {QUALITY_LABEL[tier]}
          </span>
          <span className="flex items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-3 rounded-full ${i < filled ? QUALITY_METER_FILL[tier] : "bg-surface-muted"}`}
              />
            ))}
          </span>
        </div>

        <p className="text-sm text-ink-secondary">{candidate.explanation}</p>

        {candidate.conflicts.length > 0 && (
          <ul className="text-xs text-danger">
            {candidate.conflicts.map((c, i) => (
              <li key={i}>⚠ {c}</li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={onVisualize}
        disabled={disabled}
        className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-transform duration-150 ease-out hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {visualizing ? "Generating…" : "Visualize outfit"}
      </button>
    </div>
  );
}
