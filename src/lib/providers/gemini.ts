import { GoogleGenAI, ApiError } from "@google/genai";
import type { AIProvider, ClothingAnalysis } from "./types";
import { clothingAnalysisSchema } from "@/lib/validation/clothing";
import { outfitMatchExplanationSchema } from "@/lib/validation/outfitMatch";

// gemini-2.5-flash (and gemini-2.5-flash-lite) return a 404
// ("no longer available to new users") for API keys/projects created after
// Google's 2.5-generation free-tier sunset -- confirmed by direct testing
// against a freshly created key, not just a rate-limit issue.
//
// gemini-3.5-flash (the model previously used here) now fails every request
// -- including trivial text-only prompts with no image or schema -- with a
// 503 "This model is currently experiencing high demand" / UNAVAILABLE.
// Confirmed via client.models.list(): 3.5 is still a valid, listed model for
// this API key, it's just been superseded (3.6 and 3.7 both exist, released
// 07-2026 and 08-2026 respectively per client.models.get()) and appears to
// have been deprioritized -- 100% failure rate across repeated attempts,
// both light and heavy requests, root-caused directly against the live API
// rather than assumed. gemini-3.7-flash succeeds reliably on light requests
// and succeeds intermittently on this app's actual (image + structured
// output) request under current demand -- hence the retry below, not just
// the model swap.
//
// gemini-3.6-flash was directly tested as an alternative when 3.7 started
// showing more frequent transient failures in production -- rejected: a
// failing request against 3.6 took ~59s to return its 503, versus 3.7's
// sub-1s failures. A model that fails slowly is worse than one that fails
// fast and retries, since it risks exhausting the serverless function's own
// execution timeout instead of cleanly recovering within it. Confirmed via
// direct side-by-side testing against the live API, not assumed.
const MODEL = "gemini-3.7-flash";

// 503 (UNAVAILABLE, "high demand") and 429 (RESOURCE_EXHAUSTED, rate limit)
// are the only statuses Google's own error copy explicitly describes as
// transient/worth retrying ("Spikes in demand are usually temporary").
// Everything else (401/403 auth, 404 model-not-found, 400 bad request) is a
// persistent failure that a retry can't fix, so it fails immediately.
const RETRYABLE_STATUSES = new Set([503, 429]);

// A 429 covers two genuinely different situations that read identically at
// the status-code level: a short-lived rate-limit spike (worth retrying
// fast) and the free tier's daily request quota being fully used up (not
// worth retrying at all -- Google's own response says "please retry in
// ~30s", far longer than this retry loop's delay). Confirmed live in
// production: with 6 fallback API keys all past their daily quota, the old
// code retried each one 3 times anyway, burning ~13s of wasted round-trips
// before the user saw anything. Distinguished by message text, the only
// place the two cases differ -- both are ApiError with status 429.
function isDailyQuotaExhausted(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429 && /exceeded your current quota/i.test(err.message ?? "");
}
// Bumped from 2 -> 3 after live testing showed attempt 1 failing (429 or
// 503) and attempt 2 succeeding within ~3s was common, but not guaranteed --
// two back-to-back failures under sustained demand aren't rare enough to
// leave uncovered. Each attempt fails fast (sub-1s to a few seconds) when it
// does fail, so a third attempt adds well under the delay budget of one slow
// request, not a meaningfully worse worst case.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 750;

// Bounds every individual HTTP call the SDK makes to Gemini. Without this,
// a stalled connection (as opposed to a fast HTTP error, which the retry
// logic above already handles) has no way to ever resolve or reject --
// confirmed as the likely cause of a real production report where the
// catalog upload flow stayed on "Analyzing with AI..." indefinitely with
// no error ever surfacing, across a chain of up to 6 fallback API keys
// (see FallbackAIProvider) each doing up to MAX_ATTEMPTS retries.
export const GEMINI_HTTP_TIMEOUT_MS = 20_000;

// Bounds the raw image download from Supabase storage, which happens
// before any Gemini call and isn't covered by GEMINI_HTTP_TIMEOUT_MS at
// all -- the same "stalled connection never resolves" risk applies here
// independently.
export const IMAGE_FETCH_TIMEOUT_MS = 15_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Never logs the API key -- it isn't in scope here at all, only the error
// Gemini/the SDK produced.
function logGeminiError(context: string, err: unknown, attempt: number) {
  if (err instanceof ApiError) {
    console.error(`[gemini] ${context} failed (attempt ${attempt}/${MAX_ATTEMPTS})`, {
      name: err.name,
      status: err.status,
      message: err.message,
    });
  } else if (err instanceof Error) {
    console.error(`[gemini] ${context} failed (attempt ${attempt}/${MAX_ATTEMPTS})`, {
      name: err.name,
      message: err.message,
    });
  } else {
    console.error(`[gemini] ${context} failed (attempt ${attempt}/${MAX_ATTEMPTS}) with a non-Error value`, err);
  }
}

async function generateContentWithRetry(
  client: GoogleGenAI,
  context: string,
  request: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.models.generateContent(request);
    } catch (err) {
      logGeminiError(context, err, attempt);
      const isRetryable =
        err instanceof ApiError && RETRYABLE_STATUSES.has(err.status ?? 0) && !isDailyQuotaExhausted(err);
      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
  // Unreachable (the loop always returns or throws), but keeps TypeScript
  // happy about the function having a return on every path.
  throw new Error("generateContentWithRetry exhausted attempts without returning or throwing.");
}

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
    this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: GEMINI_HTTP_TIMEOUT_MS } });
  }

  async analyzeClothingImage(imageUrl: string): Promise<ClothingAnalysis> {
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!imageResponse.ok) {
      throw new Error(`Could not fetch image for analysis (${imageResponse.status})`);
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = imageResponse.headers.get("content-type") ?? "image/jpeg";

    const result = await generateContentWithRetry(this.client, "analyzeClothingImage", {
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

    const result = await generateContentWithRetry(this.client, "explainOutfitMatch", {
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
