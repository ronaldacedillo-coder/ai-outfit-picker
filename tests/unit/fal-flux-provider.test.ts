import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OutfitGarmentInput } from "@/lib/providers/types";

const shirt: OutfitGarmentInput = {
  imageUrl: "https://example.com/shirt.jpg",
  role: "top",
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "white",
  pattern: "solid",
  style: "business_formal",
};
const pants: OutfitGarmentInput = {
  imageUrl: "https://example.com/pants.jpg",
  role: "bottom",
  category: "bottom",
  subcategory: "pants",
  primaryColor: "gray",
  pattern: "solid",
  style: "business_formal",
};

const subscribeMock = vi.fn();
const configMock = vi.fn();

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: (...args: unknown[]) => configMock(...args),
    subscribe: (...args: unknown[]) => subscribeMock(...args),
  },
}));

beforeEach(() => {
  subscribeMock.mockReset();
  configMock.mockReset();
});

describe("FalFluxImageGenProvider", () => {
  it("uses the single-image endpoint for one garment", async () => {
    subscribeMock.mockResolvedValue({
      data: { images: [{ url: "https://fal.media/result.jpg" }] },
      requestId: "req-1",
    });
    const { FalFluxImageGenProvider } = await import("@/lib/providers/fal-flux");
    const provider = new FalFluxImageGenProvider("fake-key");
    const result = await provider.generateOutfitVisualization({ garments: [shirt] });

    expect(subscribeMock).toHaveBeenCalledWith(
      "fal-ai/flux-pro/kontext",
      expect.objectContaining({ input: expect.objectContaining({ image_url: shirt.imageUrl }) })
    );
    expect(result.imageUrl).toBe("https://fal.media/result.jpg");
    expect(result.requestId).toBe("req-1");
    expect(result.model).toBe("fal-ai/flux-pro/kontext");
  });

  it("uses the multi-image endpoint for two or more garments", async () => {
    subscribeMock.mockResolvedValue({
      data: { images: [{ url: "https://fal.media/result2.jpg" }] },
      requestId: "req-2",
    });
    const { FalFluxImageGenProvider } = await import("@/lib/providers/fal-flux");
    const provider = new FalFluxImageGenProvider("fake-key");
    const result = await provider.generateOutfitVisualization({ garments: [shirt, pants] });

    expect(subscribeMock).toHaveBeenCalledWith(
      "fal-ai/flux-pro/kontext/max/multi",
      expect.objectContaining({
        input: expect.objectContaining({ image_urls: [shirt.imageUrl, pants.imageUrl] }),
      })
    );
    expect(result.model).toBe("fal-ai/flux-pro/kontext/max/multi");
  });

  it("throws a safe error when fal.ai returns no images", async () => {
    subscribeMock.mockResolvedValue({ data: { images: [] }, requestId: "req-3" });
    const { FalFluxImageGenProvider } = await import("@/lib/providers/fal-flux");
    const provider = new FalFluxImageGenProvider("fake-key");
    await expect(provider.generateOutfitVisualization({ garments: [shirt] })).rejects.toThrow();
  });

  it("throws a safe error when the fal.ai call fails", async () => {
    subscribeMock.mockRejectedValue(new Error("fal.ai internal detail that should not leak"));
    const { FalFluxImageGenProvider } = await import("@/lib/providers/fal-flux");
    const provider = new FalFluxImageGenProvider("fake-key");
    await expect(provider.generateOutfitVisualization({ garments: [shirt] })).rejects.toThrow();
  });
});
