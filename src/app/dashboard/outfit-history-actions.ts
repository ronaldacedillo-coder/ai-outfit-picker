"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getStorageProvider } from "@/lib/providers";
import { getOutfitImageUrl } from "@/app/dashboard/outfit-picker-actions";
import { generateLookTitle } from "@/lib/looks/lookTitle";
import { deriveLookStyle } from "@/lib/looks/lookStyle";
import type { LookItemSummary } from "@/lib/looks/types";
import { requireUser } from "@/lib/auth/requireUser";

type ActionResult<T> = { data: T } | { error: string };

// revalidatePath requires a live Next.js request context, which doesn't
// exist when these actions run directly from integration tests -- see the
// identical helper in dashboard/actions.ts.
function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // no request context to revalidate against (e.g. running in tests)
  }
}

// The retrieval/presentation layer over persisted outfit data (see
// architecture principle: matching and image-generation logic stay in
// matching-actions.ts / outfit-actions.ts, never duplicated here).
const LOOKS_LIMIT = 30;

interface OutfitItemQueryRow {
  clothing_item_id: string;
  role: string;
  clothing_items: {
    id: string;
    image_url: string;
    primary_color: string | null;
    style: string | null;
    clothing_subcategories: { name: string } | null;
  } | null;
}

export interface LookSummary {
  id: string;
  title: string;
  style: string;
  status: string;
  imageSignedUrl: string | null;
  compatibilityScore: number | null;
  createdAt: string;
  itemLabels: string[];
}

export async function listLooks(injectedClient?: SupabaseClient): Promise<ActionResult<{ looks: LookSummary[] }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const { data: outfits, error } = await supabase
    .from("outfits")
    .select("id, generation_status, generated_image_url, compatibility_score, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(LOOKS_LIMIT);

  if (error || !outfits) return { error: "Couldn't load your looks — please try again." };

  const storage = getStorageProvider(supabase, "outfit-images");

  const looks: LookSummary[] = await Promise.all(
    outfits.map(async (outfit) => {
      const { data: itemRows } = await supabase
        .from("outfit_items")
        .select("clothing_item_id, role, clothing_items(id, image_url, primary_color, style, clothing_subcategories(name))")
        .eq("outfit_id", outfit.id);

      const rows = (itemRows ?? []) as unknown as OutfitItemQueryRow[];
      const items: LookItemSummary[] = rows
        .filter((r) => r.clothing_items)
        .map((r) => ({
          role: r.role,
          subcategory: r.clothing_items!.clothing_subcategories?.name ?? "",
          primaryColor: r.clothing_items!.primary_color ?? "",
          style: r.clothing_items!.style ?? "casual",
        }));

      const imageSignedUrl =
        outfit.generation_status === "completed" && outfit.generated_image_url
          ? await storage.getSignedUrl(outfit.generated_image_url).catch(() => null)
          : null;

      return {
        id: outfit.id,
        title: generateLookTitle(items),
        style: deriveLookStyle(items),
        status: outfit.generation_status ?? "processing",
        imageSignedUrl,
        compatibilityScore: outfit.compatibility_score,
        createdAt: outfit.created_at,
        itemLabels: items.map((i) => `${i.primaryColor} ${i.subcategory.replace(/_/g, " ")}`.trim()),
      };
    })
  );

  return { data: { looks } };
}

export interface LookDetailItem {
  id: string;
  role: string;
  subcategory: string;
  primaryColor: string;
}

export interface LookDetail {
  id: string;
  title: string;
  status: string;
  imageSignedUrl: string | null;
  compatibilityScore: number | null;
  scoreBreakdown: Record<string, number | null> | null;
  aiExplanation: string | null;
  generationError: string | null;
  createdAt: string;
  items: LookDetailItem[];
}

export async function getLookDetail(
  outfitId: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ look: LookDetail }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const { data: outfit, error } = await supabase
    .from("outfits")
    .select(
      "id, generation_status, generated_image_url, compatibility_score, score_breakdown, ai_explanation, generation_error, created_at"
    )
    .eq("id", outfitId)
    .eq("user_id", user.id)
    .single();

  if (error || !outfit) return { error: "That look couldn't be found." };

  const { data: itemRows } = await supabase
    .from("outfit_items")
    .select("clothing_item_id, role, clothing_items(id, image_url, primary_color, style, clothing_subcategories(name))")
    .eq("outfit_id", outfit.id);

  const rows = (itemRows ?? []) as unknown as OutfitItemQueryRow[];
  const summaries: LookItemSummary[] = rows
    .filter((r) => r.clothing_items)
    .map((r) => ({
      role: r.role,
      subcategory: r.clothing_items!.clothing_subcategories?.name ?? "",
      primaryColor: r.clothing_items!.primary_color ?? "",
      style: r.clothing_items!.style ?? "casual",
    }));

  const items: LookDetailItem[] = rows
    .filter((r) => r.clothing_items)
    .map((r) => ({
      id: r.clothing_item_id,
      role: r.role,
      subcategory: r.clothing_items!.clothing_subcategories?.name ?? "",
      primaryColor: r.clothing_items!.primary_color ?? "",
    }));

  let imageSignedUrl: string | null = null;
  if (outfit.generation_status === "completed" && outfit.generated_image_url) {
    const signed = await getOutfitImageUrl(outfit.id, supabase);
    imageSignedUrl = "data" in signed ? signed.data.imageUrl : null;
  }

  return {
    data: {
      look: {
        id: outfit.id,
        title: generateLookTitle(summaries),
        status: outfit.generation_status ?? "processing",
        imageSignedUrl,
        compatibilityScore: outfit.compatibility_score,
        scoreBreakdown: outfit.score_breakdown,
        aiExplanation: outfit.ai_explanation,
        generationError: outfit.generation_error,
        createdAt: outfit.created_at,
        items,
      },
    },
  };
}

export async function deleteLook(
  outfitId: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ deleted: true }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const { data: outfit, error } = await supabase
    .from("outfits")
    .select("id, generated_image_url")
    .eq("id", outfitId)
    .eq("user_id", user.id)
    .single();

  if (error || !outfit) return { error: "That look couldn't be found." };

  if (outfit.generated_image_url) {
    const storage = getStorageProvider(supabase, "outfit-images");
    // Best-effort: a storage failure shouldn't block removing the look
    // from the user's history, and clothing items are never touched by
    // this delete regardless (outfit_items cascades from outfits, not
    // the other way around).
    await storage.deleteImage(outfit.generated_image_url).catch(() => undefined);
  }

  const { error: deleteError } = await supabase
    .from("outfits")
    .delete()
    .eq("id", outfitId)
    .eq("user_id", user.id);

  if (deleteError) return { error: "Couldn't delete that look — please try again." };

  safeRevalidatePath("/dashboard/looks");
  return { data: { deleted: true } };
}
