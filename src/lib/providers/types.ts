/**
 * Provider interfaces — the seam that keeps AI, image-generation, and
 * storage vendors swappable (see architecture doc, section D/E).
 *
 * Nothing outside src/lib/providers/* should import a vendor SDK
 * (Gemini, Hugging Face, R2, etc.) directly. Application code depends on
 * these interfaces; concrete implementations live alongside them and get
 * selected in one place (a small factory, added when the first real
 * implementation lands).
 *
 * Stubs only for now — first real implementation lands with the wardrobe
 * upload feature, not in this foundation pass.
 */

export interface ClothingAnalysis {
  category: string;
  subcategory: string;
  primaryColor: string;
  primaryColorHex?: string;
  secondaryColors: string[];
  pattern: "solid" | "striped" | "checked" | "plaid" | "printed" | "textured" | "other";
  style: "business_formal" | "business_casual" | "smart_casual" | "casual";
  formalityLevel: number; // 1-5
  description: string;
  visualDetails?: Record<string, string>; // collar, lapel, sleeve, silhouette, etc.
}

/** Vision + reasoning provider (MVP default: Google Gemini). */
export interface AIProvider {
  analyzeClothingImage(imageUrl: string): Promise<ClothingAnalysis>;
  explainOutfitMatch(input: {
    items: { name: string; role: string }[];
    scoreBreakdown: Record<string, number>;
  }): Promise<string>;
}

/** Outfit visualization provider (MVP default: self-hosted CatVTON, with a Gemini fallback). */
export interface ImageGenProvider {
  name: "catvton" | "gemini" | "fashn";
  generateOutfitVisualization(input: {
    modelReferenceUrl?: string;
    garmentImageUrls: string[];
  }): Promise<{ imageUrl: string }>;
}

/**
 * File storage provider (MVP default: Supabase Storage, private bucket;
 * Cloudflare R2 remains the planned future swap if storage needs grow).
 *
 * `uploadImage`'s returned `url` is the storage object PATH, not a
 * directly-fetchable URL — the bucket is private. Callers resolve a
 * short-lived renderable URL via `getSignedUrl`.
 */
export interface StorageProvider {
  uploadImage(input: { userId: string; file: Blob; path: string }): Promise<{ url: string }>;
  deleteImage(path: string): Promise<void>;
  getSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;
}
