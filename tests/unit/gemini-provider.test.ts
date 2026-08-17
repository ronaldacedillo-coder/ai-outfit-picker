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

  it("constructs the client with a bounded HTTP timeout (regression: an unbounded Gemini call left the catalog-upload UI stuck on 'Analyzing with AI...' forever with no way to recover)", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const { GeminiAIProvider, GEMINI_HTTP_TIMEOUT_MS } = await import("@/lib/providers/gemini");
    new GeminiAIProvider("fake-key");
    const lastCallArgs = (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(lastCallArgs).toMatchObject({ apiKey: "fake-key", httpOptions: { timeout: GEMINI_HTTP_TIMEOUT_MS } });
  });

  it("fetches the reference image with a bounded abort signal (regression: same indefinite-hang risk applies to the image download, which happens before any Gemini call)", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await provider.analyzeClothingImage("https://example.com/photo.jpg");
    const [, options] = fetchMock.mock.calls.at(-1)!;
    expect((options as { signal?: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
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

  it("retries on a 429 (rate limit) and gives up after exhausting all attempts", async () => {
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
    // MAX_ATTEMPTS is 3 (bumped from 2 after live testing showed
    // back-to-back transient failures under sustained demand weren't rare
    // enough to leave uncovered -- see the comment in gemini.ts).
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("succeeds on the third attempt after two transient failures", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new MockApiError(503, "high demand"))
      .mockRejectedValueOnce(new MockApiError(429, "rate limited"))
      .mockResolvedValueOnce({ text: validJson });
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return { models: { generateContent } };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    const result = await provider.analyzeClothingImage("https://example.com/photo.jpg");
    expect(result.category).toBe("top");
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 429 that reports daily quota exhaustion, only a generic rate limit (regression: retrying an exhausted daily quota 3 times per fallback key wasted ~13s in production before any error surfaced)", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const generateContent = vi.fn().mockRejectedValue(
      new MockApiError(
        429,
        '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.7-flash\\nPlease retry in 37.7s.","status":"RESOURCE_EXHAUSTED"}}'
      )
    );
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return { models: { generateContent } };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(provider.analyzeClothingImage("https://example.com/photo.jpg")).rejects.toThrow(
      /exceeded your current quota/
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
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
