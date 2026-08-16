import { fal } from "@fal-ai/client";
import type { ImageGenProvider, OutfitGarmentInput } from "./types";
import { buildVisualizationPrompt } from "@/lib/outfit/buildVisualizationPrompt";
import { occasionEnum, styleContextEnum } from "@/lib/validation/occasion";

const SINGLE_ENDPOINT = "fal-ai/flux-pro/kontext";
const MULTI_ENDPOINT = "fal-ai/flux-pro/kontext/max/multi";

interface FalImageResult {
  data?: { images?: { url: string }[] };
  requestId?: string;
}

export class FalFluxImageGenProvider implements ImageGenProvider {
  readonly name = "fal-flux";

  constructor(apiKey: string) {
    fal.config({ credentials: apiKey });
  }

  async generateOutfitVisualization(input: {
    garments: OutfitGarmentInput[];
    seed?: number;
    occasion?: string;
    styleContext?: string;
  }): Promise<{ imageUrl: string; requestId: string; model: string; prompt: string }> {
    // Re-validated here (not just trusted from the caller) since this
    // context only ever informs pose/setting wording in the prompt --
    // an unrecognized value is silently dropped rather than leaking an
    // "undefined" label into a real generation prompt.
    const parsedOccasion = input.occasion ? occasionEnum.safeParse(input.occasion) : undefined;
    const parsedStyleContext = input.styleContext ? styleContextEnum.safeParse(input.styleContext) : undefined;
    const prompt = buildVisualizationPrompt(input.garments, {
      occasion: parsedOccasion?.success ? parsedOccasion.data : undefined,
      styleContext: parsedStyleContext?.success ? parsedStyleContext.data : undefined,
    });
    const model = input.garments.length >= 2 ? MULTI_ENDPOINT : SINGLE_ENDPOINT;
    const requestInput =
      input.garments.length >= 2
        ? { prompt, image_urls: input.garments.map((g) => g.imageUrl), seed: input.seed }
        : { prompt, image_url: input.garments[0].imageUrl, seed: input.seed };

    let result: FalImageResult;
    try {
      result = (await fal.subscribe(model, { input: requestInput })) as FalImageResult;
    } catch {
      throw new Error("Image generation failed — please try again.");
    }

    const imageUrl = result.data?.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error("Image generation did not return a result — please try again.");
    }

    return {
      imageUrl,
      requestId: result.requestId ?? "",
      model,
      prompt,
    };
  }
}
