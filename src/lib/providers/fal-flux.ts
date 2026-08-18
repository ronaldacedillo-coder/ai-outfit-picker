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
    // Raised from the API default (3.5) -- this app's prompt is dense with
    // strict "preserve exactly" / "do not render X" fidelity constraints
    // (garment category locks, sleeve-length locks, color/pattern
    // fidelity), and the default CFG scale left the model following its
    // own learned visual conventions over explicit instructions often
    // enough to matter: confirmed live, a short-sleeve shirt worn under a
    // blazer still showed a shirt cuff at the blazer's wrist across two
    // real generations even after the prompt instruction was made very
    // explicit and repeated twice. A higher guidance scale weights prompt
    // adherence more heavily against the model's own priors.
    //
    // Briefly raised to 8 in an attempt to fix a recurring closed-jacket
    // issue (see buildTopLineOpenJacketReminder in
    // buildVisualizationPrompt.ts for the prompt-side half of that fix).
    // Reverted back to 6.5 after a real generation at 8 came back with the
    // jacket rendered as a sleeveless, armless cape draped over the
    // shoulders in the shirt's own burgundy color instead of its actual
    // gray -- i.e. guidance_scale 8 didn't just fail to fix the open/closed
    // problem, it broke garment category, construction, and color fidelity
    // outright, which is a strictly worse failure mode. Pushing this value
    // too high trades away fidelity to the reference photos in exchange for
    // stricter (but not even reliably correct) text-prompt adherence, and
    // 6.5 is the highest value confirmed not to cause that kind of
    // breakdown. The open/closed-jacket problem is being addressed purely
    // through prompt wording now, not this lever.
    const GUIDANCE_SCALE = 6.5;
    // No negative_prompt field here by design, not by oversight -- checked
    // fal.ai's own API reference for both fal-ai/flux-pro/kontext and
    // fal-ai/flux-pro/kontext/max/multi (the two endpoints below) and
    // neither accepts a separate negative-prompt parameter. The
    // "never render" constraints that would otherwise go there are folded
    // into buildVisualizationPrompt.ts's own prompt text instead (see
    // section 22 of MASTER_PROMPT there).
    const requestInput =
      input.garments.length >= 2
        ? {
            prompt,
            image_urls: input.garments.map((g) => g.imageUrl),
            seed: input.seed,
            guidance_scale: GUIDANCE_SCALE,
          }
        : { prompt, image_url: input.garments[0].imageUrl, seed: input.seed, guidance_scale: GUIDANCE_SCALE };

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
