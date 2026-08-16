"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { occasionEnum, styleContextEnum } from "@/lib/validation/occasion";

type ActionResult<T> = { data: T } | { error: string };

// revalidatePath requires a live Next.js request context -- see the
// identical helper in src/app/dashboard/actions.ts.
function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // no request context to revalidate against (e.g. running in tests)
  }
}

const createOverrideSchema = z
  .object({
    baseItemId: z.string().uuid().optional(),
    baseCategoryId: z.number().int().positive().optional(),
    baseSubcategoryId: z.number().int().positive().optional(),
    matchedItemId: z.string().uuid().optional(),
    matchedCategoryId: z.number().int().positive().optional(),
    matchedSubcategoryId: z.number().int().positive().optional(),
    reciprocal: z.boolean().default(false),
    occasion: occasionEnum.optional(),
    styleContext: styleContextEnum.optional(),
    priority: z.number().int().default(0),
  })
  .refine((d) => !!d.baseItemId || (!!d.baseCategoryId && !!d.baseSubcategoryId), {
    message: "Select a base item, or a base category and subcategory.",
    path: ["baseItemId"],
  })
  .refine((d) => !!d.matchedItemId || (!!d.matchedCategoryId && !!d.matchedSubcategoryId), {
    message: "Select a matched item, or a matched category and subcategory.",
    path: ["matchedItemId"],
  });
export type CreateMatchingOverrideInput = z.infer<typeof createOverrideSchema>;

export interface MatchingOverrideRow {
  id: string;
  base_item_id: string | null;
  base_category_id: number | null;
  base_subcategory_id: number | null;
  matched_item_id: string | null;
  matched_category_id: number | null;
  matched_subcategory_id: number | null;
  reciprocal: boolean;
  occasion: string | null;
  style_context: string | null;
  priority: number;
  created_at: string;
}

export async function listMatchingOverrides(
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ rules: MatchingOverrideRow[] }>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) return { error: "Not authorized." };

  const { data, error } = await supabase
    .from("matching_overrides")
    .select(
      "id, base_item_id, base_category_id, base_subcategory_id, matched_item_id, matched_category_id, matched_subcategory_id, reciprocal, occasion, style_context, priority, created_at"
    )
    .order("created_at", { ascending: false });

  if (error || !data) return { error: "Couldn't load matching rules — please try again." };
  return { data: { rules: data } };
}

export async function createMatchingOverride(
  input: CreateMatchingOverrideInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ id: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) return { error: "Not authorized." };

  const parsed = createOverrideSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { data, error } = await supabase
    .from("matching_overrides")
    .insert({
      base_item_id: parsed.data.baseItemId ?? null,
      base_category_id: parsed.data.baseCategoryId ?? null,
      base_subcategory_id: parsed.data.baseSubcategoryId ?? null,
      matched_item_id: parsed.data.matchedItemId ?? null,
      matched_category_id: parsed.data.matchedCategoryId ?? null,
      matched_subcategory_id: parsed.data.matchedSubcategoryId ?? null,
      reciprocal: parsed.data.reciprocal,
      occasion: parsed.data.occasion ?? null,
      style_context: parsed.data.styleContext ?? null,
      priority: parsed.data.priority,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't create the rule — please try again." };
  safeRevalidatePath("/admin/matching-overrides");
  return { data: { id: data.id } };
}

export async function deleteMatchingOverride(
  id: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ id: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) return { error: "Not authorized." };

  const { error } = await supabase.from("matching_overrides").delete().eq("id", id);
  if (error) return { error: "Couldn't delete the rule — please try again." };

  safeRevalidatePath("/admin/matching-overrides");
  return { data: { id } };
}
