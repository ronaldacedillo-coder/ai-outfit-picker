import { GoogleGenAI } from "@google/genai";
import type { AIProvider, ClothingAnalysis } from "./types";
import { clothingAnalysisSchema } from "@/lib/validation/clothing";
import { outfitMatchExplanationSchema } from "@/lib/validation/outfitMatch";

// gemini-2.5-flash (and gemini-2.5-flash-lite) return a 404
// ("no longer available to new users") for API keys/projects created after
// Google's 2.5-generation free-tier sunset -- confirmed by direct testing
// against a freshly created key, not just a rate-limit issue. gemini-3.5-flash
// is the GA (non-preview) successor with a comparable free tier (1,500
// req/day as of Aug 2026).
const MODEL = "gemini-3.5-flash";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string" },
    subcategory: { type: "string" },
    primaryColor: { type: "string" },
    primaryColorHex: { type: "string" },
    secondaryColors: { type: "array", items: { type: "string" } },
    pattern: {
      type: "string",
      enum: ["solid", "striped", "checked", "plaid", "printed", "textured", "other"],
    },
    style: {
      type: "string",
      enum: ["business_formal", "business_casual", "smart_casual", "casual"],
    },
    formalityLevel: { type: "integer" },
    description: { type: "string" },
    visualDetails: {
      type: "object",
      properties: {
        collar: { type: "string" },
        lapel: { type: "string" },
        sleeve: { type: "string" },
        silhouette: { type: "string" },
        texture: { type: "string" },
      },
    },
  },
  required: [
    "category", "subcategory", "primaryColor", "secondaryColors",
    "pattern", "style", "formalityLevel", "description",
  ],
};

const PROMPT = `You are analyzing a single photo of one clothing item from a personal wardrobe app.
Describe only what you can actually see in the image — do not invent details you can't observe.
Return the classification as JSON matching the provided schema: overall category (e.g. "top", "bottom", "outerwear"), a specific subcategory in plain English (e.g. "long-sleeve shirt", "polo shirt", "business jacket"), the primary color, any secondary colors, the pattern, the style, a formality level from 1 (very casual) to 5 (very formal), a one-sentence description, and any visible details like collar, lapel, sleeve, silhouette, or texture.`;

export class GeminiAIProvider implements AIProvider {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async analyzeClothingImage(imageUrl: string): Promise<ClothingAnalysis> {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Could not fetch image for analysis (${imageResponse.status})`);
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = imageResponse.headers.get("content-type") ?? "image/jpeg";

    const result = await this.client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: PROMPT }, { inlineData: { mimeType, data: base64Data } }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const raw = result.text;
    if (!raw) {
      throw new Error("Gemini returned an empty response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Gemini returned invalid JSON.");
    }

    const validated = clothingAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Gemini response failed validation: ${validated.error.message}`);
    }
    return validated.data;
  }

  async explainOutfitMatch(input: {
    items: { name: string; role: string }[];
    scoreBreakdown: Record<string, number>;
  }): Promise<{ explanation: string; conflicts: string[]; rank?: number }> {
    const prompt = `You are a personal styling assistant. Given this candidate outfit and its already-computed compatibility scores, write a concise (1-2 sentence) user-facing explanation of why it works, and list any real styling conflicts (empty array if none). Do not invent facts not implied by the data.

Outfit items: ${JSON.stringify(input.items)}
Computed scores (0-100 each): ${JSON.stringify(input.scoreBreakdown)}

Return JSON: { "explanation": string, "conflicts": string[] }`;

    const result = await this.client.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            explanation: { type: "string" },
            conflicts: { type: "array", items: { type: "string" } },
          },
          required: ["explanation", "conflicts"],
        },
      },
    });

    const raw = result.text;
    if (!raw) throw new Error("Gemini returned an empty response.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Gemini returned invalid JSON.");
    }
    const validated = outfitMatchExplanationSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Gemini explanation failed validation: ${validated.error.message}`);
    }
    return validated.data;
  }
}
