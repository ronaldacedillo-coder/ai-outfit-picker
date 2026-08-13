import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider, StorageProvider } from "./types";
import { GeminiAIProvider } from "./gemini";
import { SupabaseStorageProvider } from "./supabase-storage";

export function getAIProvider(): AIProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GeminiAIProvider(apiKey);
}

export function getStorageProvider(supabase: SupabaseClient): StorageProvider {
  return new SupabaseStorageProvider(supabase);
}
