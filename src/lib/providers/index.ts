import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider, ImageGenProvider, StorageProvider } from "./types";
import { GeminiAIProvider } from "./gemini";
import { SupabaseStorageProvider } from "./supabase-storage";
import { FalFluxImageGenProvider } from "./fal-flux";

export function getAIProvider(): AIProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GeminiAIProvider(apiKey);
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
