import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider, ImageGenProvider, StorageProvider } from "./types";
import { GeminiAIProvider } from "./gemini";
import { FallbackAIProvider } from "./fallback";
import { SupabaseStorageProvider } from "./supabase-storage";
import { FalFluxImageGenProvider } from "./fal-flux";

// GEMINI_API_KEY_FALLBACK, GEMINI_API_KEY_FALLBACK_2, _3, ... are optional --
// each one a Gemini API key from its own separate Google Cloud project (a
// fresh quota pool, not just another key on the same project). Collected in
// order, stopping at the first unset slot, so adding a fourth key later is
// just adding GEMINI_API_KEY_FALLBACK_3 to the env, no code change needed.
// Added after the primary key's free-tier quota was exhausted in
// production; with none configured, behavior is identical to before
// (primary key only, no wrapping).
function collectFallbackKeys(): string[] {
  const keys: string[] = [];
  const first = process.env.GEMINI_API_KEY_FALLBACK;
  if (!first) return keys;
  keys.push(first);
  for (let i = 2; ; i++) {
    const next = process.env[`GEMINI_API_KEY_FALLBACK_${i}`];
    if (!next) break;
    keys.push(next);
  }
  return keys;
}

export function getAIProvider(): AIProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  const primary = new GeminiAIProvider(apiKey);

  const fallbackKeys = collectFallbackKeys();
  if (fallbackKeys.length === 0) {
    return primary;
  }
  return new FallbackAIProvider([primary, ...fallbackKeys.map((key) => new GeminiAIProvider(key))]);
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
