export interface DisplayGarment {
  id: string;
  role: string;
  subcategory: string;
  primaryColor: string;
  imageSignedUrl: string;
}

export interface DisplayCandidate {
  garments: DisplayGarment[];
  score: number;
  scoreBreakdown: {
    color: number;
    formality: number;
    style: number;
    pattern: number;
    silhouette: number | null;
  };
  explanation: string;
  conflicts: string[];
  // Not shown as technical AI terminology to the end user -- see
  // RecommendationCard's label mapping ("ARROW STYLE PICK" /
  // "AI STYLE RECOMMENDATION" / no badge at all for a plain fallback).
  source?: "admin_override" | "ai" | "fallback";
}
