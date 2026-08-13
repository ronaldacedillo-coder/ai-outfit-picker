"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider, getStorageProvider } from "@/lib/providers";
import type { AIProvider } from "@/lib/providers/types";
import { clothingItemInputSchema, type ClothingItemInput } from "@/lib/validation/clothing";

type ActionResult<T> = { data: T } | { error: string };

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// revalidatePath requires a live Next.js request context (an internal
// AsyncLocalStorage store). That context doesn't exist when these actions
// are invoked directly -- e.g. from integration tests -- so calling it
// there throws. There's nothing to invalidate outside a real request
// anyway, so it's safe to swallow.
function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // no request context to revalidate against (e.g. running in tests)
  }
}

export async function uploadClothingPhoto(
  file: Blob,
  fileExt: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ path: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const path = `${user.id}/${randomUUID()}.${fileExt}`;
  try {
    const storage = getStorageProvider(supabase);
    await storage.uploadImage({ userId: user.id, file, path });
    return { data: { path } };
  } catch {
    return { error: "Couldn't upload the photo — please try again." };
  }
}

export async function analyzeClothingPhoto(
  path: string,
  injectedClient?: SupabaseClient,
  injectedAI?: AIProvider
): Promise<ActionResult<{ analysis: Awaited<ReturnType<AIProvider["analyzeClothingImage"]>> }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };
  if (!path.startsWith(`${user.id}/`)) return { error: "Invalid photo reference." };

  try {
    const storage = getStorageProvider(supabase);
    const signedUrl = await storage.getSignedUrl(path, 300);
    const ai = injectedAI ?? getAIProvider();
    const analysis = await ai.analyzeClothingImage(signedUrl);
    return { data: { analysis } };
  } catch {
    return { error: "AI analysis is unavailable right now — you can still enter details manually." };
  }
}

export async function saveClothingItem(
  input: ClothingItemInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ id: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const parsed = clothingItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some details are missing or invalid." };

  const { data, error } = await supabase
    .from("clothing_items")
    .insert({
      user_id: user.id,
      image_url: parsed.data.imagePath,
      category_id: parsed.data.categoryId,
      subcategory_id: parsed.data.subcategoryId,
      name: parsed.data.name ?? null,
      primary_color: parsed.data.primaryColor,
      primary_color_hex: parsed.data.primaryColorHex ?? null,
      secondary_colors: parsed.data.secondaryColors,
      pattern: parsed.data.pattern,
      style: parsed.data.style,
      formality_level: parsed.data.formalityLevel,
      description: parsed.data.description,
      ai_analysis: parsed.data.aiAnalysis ?? null,
      user_edited: parsed.data.userEdited,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't save this item — please try again." };

  safeRevalidatePath("/dashboard");
  return { data: { id: data.id } };
}

export async function updateClothingItem(
  id: string,
  input: ClothingItemInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ id: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const parsed = clothingItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some details are missing or invalid." };

  const { data, error } = await supabase
    .from("clothing_items")
    .update({
      category_id: parsed.data.categoryId,
      subcategory_id: parsed.data.subcategoryId,
      name: parsed.data.name ?? null,
      primary_color: parsed.data.primaryColor,
      primary_color_hex: parsed.data.primaryColorHex ?? null,
      secondary_colors: parsed.data.secondaryColors,
      pattern: parsed.data.pattern,
      style: parsed.data.style,
      formality_level: parsed.data.formalityLevel,
      description: parsed.data.description,
      user_edited: true,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't save your changes — please try again." };

  safeRevalidatePath("/dashboard");
  return { data: { id: data.id } };
}

export async function deleteClothingItem(
  id: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ id: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const { data: item, error: fetchError } = await supabase
    .from("clothing_items")
    .select("image_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (fetchError || !item) return { error: "Item not found." };

  const { error: deleteError } = await supabase
    .from("clothing_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (deleteError) return { error: "Couldn't delete this item — please try again." };

  try {
    const storage = getStorageProvider(supabase);
    await storage.deleteImage(item.image_url);
  } catch {
    // DB row is already gone; a lingering Storage object isn't user-visible.
  }

  safeRevalidatePath("/dashboard");
  return { data: { id } };
}

export async function cancelClothingUpload(path: string, injectedClient?: SupabaseClient): Promise<void> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user || !path.startsWith(`${user.id}/`)) return;
  try {
    const storage = getStorageProvider(supabase);
    await storage.deleteImage(path);
  } catch {
    // best-effort cleanup of an unsaved upload
  }
}
