import { z } from "zod";

// Chosen for ARROW PH's office/menswear styling context -- a concrete
// proposal, not something ARROW itself specified. Worth a merchandising
// sanity check before this set is treated as final, since changing it
// later is a DB check-constraint migration, not a code-only change.
export const occasionEnum = z.enum(["OFFICE", "BUSINESS_MEETING", "CASUAL_FRIDAY", "WEEKEND", "EVENING_EVENT"]);
export type Occasion = z.infer<typeof occasionEnum>;

export const OCCASION_LABELS: Record<Occasion, string> = {
  OFFICE: "Office",
  BUSINESS_MEETING: "Business Meeting",
  CASUAL_FRIDAY: "Casual Friday",
  WEEKEND: "Weekend",
  EVENING_EVENT: "Evening Event",
};

// Matches ARROW's classic-heritage-with-modern-fits brand positioning.
export const styleContextEnum = z.enum(["CLASSIC", "MODERN", "RELAXED"]);
export type StyleContext = z.infer<typeof styleContextEnum>;

export const STYLE_CONTEXT_LABELS: Record<StyleContext, string> = {
  CLASSIC: "Classic",
  MODERN: "Modern",
  RELAXED: "Relaxed",
};
