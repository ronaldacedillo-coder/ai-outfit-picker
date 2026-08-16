import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider, ImageGenProvider, StorageProvider } from "./types";
import { GeminiAIProvider } from "./gemini";
import { FallbackAIProvider } from "./fallback";
import { SupabaseStorageProvider } from "./supabase-storage";
import { FalFluxImageGenProvider } from "./fal-flux";

// GEMINI_API_KEY_FALLBACK is optional -- a second Gemini API key from a
// separate Google Cloud project (a fresh quota pool, not just a second key
// on the same project). Added after the primary key's free-tier quota was
// exhausted in production; without it configured, behavior is identical to
// before (primary key only, no wrapping).
export function getAIProvider(): AIProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  const primary = new GeminiAIProvider(apiKey);

  const fallbackKey = process.env.GEMINI_API_KEY_FALLBACK;
  if (!fallbackKey) {
    return primary;
  }
  return new FallbackAIProvider([primary, new GeminiAIProvider(fallbackKey)]);
}

export function getStorageProvider(supabase: SupabaseClient, bucket?: string): StorageProvider {
  return new SupabaseStorageProvider(supabase, bucket);
}

export function getImageGenProvider(): ImageGenProvider {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY is not configured.");
  }
  return new FalFluxImageGenProvider(apiKey);
}
