export interface CandidateGarment {
  id: string;
  role: string; // "outerwear" | "top" | "bottom"
  category: string;
  subcategory: string;
  primaryColor: string;
  primaryColorHex: string | null;
  pattern: string;
  style: string;
  formalityLevel: number;
  visualDetails: Record<string, string> | null;
  imagePath: string;
}

export interface ScoreBreakdown {
  color: number;
  formality: number;
  style: number;
  pattern: number;
  silhouette: number | null; // null when not scored (data absent)
}

export interface OutfitCandidate {
  garments: CandidateGarment[];
  score: number; // 0-100
  scoreBreakdown: ScoreBreakdown;
}
