export type QualityTier = "excellent" | "very_good" | "good" | "possible";

export function qualityTier(score: number): QualityTier {
  if (score >= 85) return "excellent";
  if (score >= 70) return "very_good";
  if (score >= 55) return "good";
  return "possible";
}

export const QUALITY_LABEL: Record<QualityTier, string> = {
  excellent: "Excellent match",
  very_good: "Very good match",
  good: "Good match",
  possible: "Possible match",
};

// Tailwind classes only -- no raw score is ever shown in the UI (product
// direction: "Great match," not "score: 87"). Muted, editorial tones rather
// than default-bright Tailwind status colors, kept just distinct enough to
// read as a real hierarchy (excellent -> possible).
export const QUALITY_BADGE: Record<QualityTier, string> = {
  excellent: "bg-emerald-50 text-emerald-900 ring-emerald-800/20",
  very_good: "bg-amber-50 text-amber-900 ring-amber-800/20",
  good: "bg-surface-muted text-ink-secondary ring-border",
  possible: "bg-surface-muted text-ink-muted ring-border",
};

export const QUALITY_METER_FILL: Record<QualityTier, string> = {
  excellent: "bg-emerald-800",
  very_good: "bg-amber-800",
  good: "bg-ink-secondary",
  possible: "bg-ink-muted",
};

// A five-tick gauge -- ticks filled scales with the score without ever
// surfacing the number itself.
export function meterTicksFilled(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}
