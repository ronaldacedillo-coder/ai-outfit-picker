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
// direction: "Great match," not "score: 87").
export const QUALITY_BADGE: Record<QualityTier, string> = {
  excellent: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  very_good: "bg-teal-50 text-teal-800 ring-teal-200",
  good: "bg-amber-50 text-amber-800 ring-amber-200",
  possible: "bg-stone-100 text-stone-700 ring-stone-300",
};

export const QUALITY_METER_FILL: Record<QualityTier, string> = {
  excellent: "bg-emerald-600",
  very_good: "bg-teal-600",
  good: "bg-amber-600",
  possible: "bg-stone-500",
};

// A five-tick gauge -- ticks filled scales with the score without ever
// surfacing the number itself.
export function meterTicksFilled(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}
