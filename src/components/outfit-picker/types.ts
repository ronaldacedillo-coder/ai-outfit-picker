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
}
