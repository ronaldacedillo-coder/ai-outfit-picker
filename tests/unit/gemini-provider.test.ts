import { describe, it, expect, vi } from "vitest";

const validJson = JSON.stringify({
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "light blue",
  secondaryColors: [],
  pattern: "solid",
  style: "business_formal",
  formalityLevel: 4,
  description: "Light blue long-sleeved business shirt.",
});

class MockApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return {
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: validJson }),
      },
    };
  }),
  ApiError: MockApiError,
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  headers: new Headers({ "content-type": "image/jpeg" }),
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
}) as unknown as typeof fetch;

describe("GeminiAIProvider", () => {
  it("returns a validated ClothingAnalysis on a well-formed response", async () => {
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    const result = await provider.analyzeClothingImage("https://example.com/photo.jpg");
    expect(result.category).toBe("top");
    expect(result.formalityLevel).toBe(4);
  });

  it("throws when Gemini returns invalid JSON", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return { models: { generateContent: vi.fn().mockResolvedValue({ text: "not json" }) } };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(provider.analyzeClothingImage("https://example.com/photo.jpg")).rejects.toThrow();
  });

  it("throws when Gemini's JSON fails schema validation", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return {
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify({ category: "top" }) }),
        },
      };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(provider.analyzeClothingImage("https://example.com/photo.jpg")).rejects.toThrow();
  });
});

describe("GeminiAIProvider.explainOutfitMatch", () => {
  it("returns a validated structured explanation", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify({ explanation: "Clean contrast, formal tone.", conflicts: [], rank: 1 }),
          }),
        },
      };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    const result = await provider.explainOutfitMatch({
      items: [{ name: "navy jacket", role: "outerwear" }, { name: "white shirt", role: "top" }],
      scoreBreakdown: { color: 90, formality: 100 },
    });
    expect(result.explanation).toContain("contrast");
    expect(result.conflicts).toEqual([]);
  });

  it("throws when Gemini returns invalid JSON", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return { models: { generateContent: vi.fn().mockResolvedValue({ text: "not json" }) } };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(
      provider.explainOutfitMatch({ items: [], scoreBreakdown: {} })
    ).rejects.toThrow();
  });

  it("throws when Gemini's explanation JSON fails validation", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return {
        models: { generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify({}) }) },
      };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(
      provider.explainOutfitMatch({ items: [], scoreBreakdown: {} })
    ).rejects.toThrow();
  });
});

describe("GeminiAIProvider retry behavior", () => {
  it("retries once on a 503 (UNAVAILABLE) and succeeds on the second attempt", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new MockApiError(503, "high demand"))
      .mockResolvedValueOnce({ text: validJson });
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return { models: { generateContent } };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    const result = await provider.analyzeClothingImage("https://example.com/photo.jpg");
    expect(result.category).toBe("top");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("retries once on a 429 (rate limit) and gives up if it fails again", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const generateContent = vi.fn().mockRejectedValue(new MockApiError(429, "rate limited"));
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return { models: { generateContent } };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(provider.analyzeClothingImage("https://example.com/photo.jpg")).rejects.toThrow(
      /rate limited/
    );
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable error (e.g. 401 invalid API key)", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const generateContent = vi.fn().mockRejectedValue(new MockApiError(401, "invalid API key"));
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return { models: { generateContent } };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(provider.analyzeClothingImage("https://example.com/photo.jpg")).rejects.toThrow(
      /invalid API key/
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
