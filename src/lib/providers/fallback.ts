import type { AIProvider, ClothingAnalysis } from "./types";

// Never logs anything that could contain a key -- only the provider's
// position in the chain and whatever error message the underlying call
// produced (matching the existing logGeminiError convention in gemini.ts).
function logProviderFailure(context: string, providerIndex: number, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[FallbackAIProvider] ${context} failed on provider ${providerIndex}`, { message });
}

// Composes multiple AIProvider instances into one: tries each in order,
// falling through to the next only once a provider's own internal retry
// logic (e.g. GeminiAIProvider's 3-attempt retry) has already been
// exhausted. This is provider-level fallback (different account/quota
// pool, or eventually a different vendor entirely), layered on top of
// each individual provider's own request-level retry -- not a
// replacement for it.
export class FallbackAIProvider implements AIProvider {
  constructor(private readonly providers: AIProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackAIProvider requires at least one provider.");
    }
  }

  async analyzeClothingImage(imageUrl: string): Promise<ClothingAnalysis> {
    let lastError: unknown;
    for (let i = 0; i < this.providers.length; i++) {
      try {
        return await this.providers[i].analyzeClothingImage(imageUrl);
      } catch (err) {
        logProviderFailure("analyzeClothingImage", i, err);
        lastError = err;
      }
    }
    throw lastError;
  }

  async explainOutfitMatch(
    input: Parameters<AIProvider["explainOutfitMatch"]>[0]
  ): ReturnType<AIProvider["explainOutfitMatch"]> {
    let lastError: unknown;
    for (let i = 0; i < this.providers.length; i++) {
      try {
        return await this.providers[i].explainOutfitMatch(input);
      } catch (err) {
        logProviderFailure("explainOutfitMatch", i, err);
        lastError = err;
      }
    }
    throw lastError;
  }
}
