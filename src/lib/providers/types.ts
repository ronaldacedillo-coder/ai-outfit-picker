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
  }): Promise<{ explanation: string; conflicts: string[]; rank?: number }>;
}

export interface OutfitGarmentInput {
  imageUrl: string; // signed URL, resolved by the caller via StorageProvider
  role: string; // "top" | "bottom" | "outerwear" | ... (matches outfit_items.role)
  category: string;
  subcategory: string;
  primaryColor: string;
  pattern: string;
  style: string;
}

/**
 * Outfit visualization provider (MVP default: FLUX via fal.ai). `name` is a
 * plain string, not a closed union -- the interface exists so providers can
 * be added without editing it every time.
 */
export interface ImageGenProvider {
  name: string;
  generateOutfitVisualization(input: {
    garments: OutfitGarmentInput[];
    seed?: number;
  }): Promise<{
    imageUrl: string; // temporary, provider-hosted -- caller downloads and re-stores it
    requestId: string;
    model: string;
    prompt: string;
  }>;
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
