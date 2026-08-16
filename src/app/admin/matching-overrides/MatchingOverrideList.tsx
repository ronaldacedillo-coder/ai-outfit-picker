"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMatchingOverride, type MatchingOverrideRow } from "./actions";
import { OCCASION_LABELS, STYLE_CONTEXT_LABELS, type Occasion, type StyleContext } from "@/lib/validation/occasion";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";

interface ItemOption {
  id: string;
  label: string;
}

function describeSide(
  itemId: string | null,
  categoryId: number | null,
  subcategoryId: number | null,
  items: ItemOption[],
  categories: CategoryOption[],
  subcategories: SubcategoryOption[]
): string {
  if (itemId) {
    return items.find((i) => i.id === itemId)?.label ?? "(deleted item)";
  }
  const category = categories.find((c) => c.id === categoryId)?.name ?? "";
  const subcategory = subcategories.find((s) => s.id === subcategoryId)?.name.replace(/_/g, " ") ?? "";
  return [category, subcategory].filter(Boolean).join(" / ") || "(unspecified)";
}

export function MatchingOverrideList({
  rules,
  items,
  categories,
  subcategories,
}: {
  rules: MatchingOverrideRow[];
  items: ItemOption[];
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteMatchingOverride(id);
    setDeletingId(null);
    router.refresh();
  }

  if (rules.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface-muted px-6 py-10 text-center text-sm text-ink-secondary">
        No matching rules yet — rules you create above will always outrank the AI recommendation for their base item.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-medium text-ink">Active rules</h2>
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-1.5 text-ink">
            <span className="font-medium">
              {describeSide(rule.base_item_id, rule.base_category_id, rule.base_subcategory_id, items, categories, subcategories)}
            </span>
            <span className="text-ink-secondary">{rule.reciprocal ? "↔" : "→"}</span>
            <span className="font-medium">
              {describeSide(
                rule.matched_item_id,
                rule.matched_category_id,
                rule.matched_subcategory_id,
                items,
                categories,
                subcategories
              )}
            </span>
            {rule.occasion && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-secondary">
                {OCCASION_LABELS[rule.occasion as Occasion] ?? rule.occasion}
              </span>
            )}
            {rule.style_context && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-secondary">
                {STYLE_CONTEXT_LABELS[rule.style_context as StyleContext] ?? rule.style_context}
              </span>
            )}
            {rule.priority !== 0 && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-secondary">
                priority {rule.priority}
              </span>
            )}
          </div>
          <button
            onClick={() => handleDelete(rule.id)}
            disabled={deletingId === rule.id}
            className="w-fit text-xs text-danger underline underline-offset-2 disabled:opacity-60"
          >
            {deletingId === rule.id ? "Deleting…" : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}
