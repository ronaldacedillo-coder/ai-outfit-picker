"use client";

import { useState } from "react";
import type { ClothingAnalysisInput, ClothingItemInput } from "@/lib/validation/clothing";
import { matchSubcategory, type CategoryOption, type SubcategoryOption } from "@/lib/wardrobe/matchCategory";

const PATTERNS = ["solid", "striped", "checked", "plaid", "printed", "textured", "other"] as const;
const STYLES = ["business_formal", "business_casual", "smart_casual", "casual"] as const;

export type ReviewFormSaveInput = Omit<ClothingItemInput, "imagePath" | "aiAnalysis">;

export interface ReviewFormValue {
  categoryId: number | null;
  subcategoryId: number | null;
  name: string;
  primaryColor: string;
  primaryColorHex: string;
  secondaryColors: string;
  pattern: (typeof PATTERNS)[number];
  style: (typeof STYLES)[number];
  formalityLevel: number;
  description: string;
}

function fromAnalysis(
  analysis: ClothingAnalysisInput | null,
  categories: CategoryOption[],
  subcategories: SubcategoryOption[]
): ReviewFormValue {
  const match = analysis
    ? matchSubcategory(categories, subcategories, analysis.category, analysis.subcategory)
    : null;
  return {
    categoryId: match?.categoryId ?? null,
    subcategoryId: match?.subcategoryId ?? null,
    name: "",
    primaryColor: analysis?.primaryColor ?? "",
    primaryColorHex: analysis?.primaryColorHex ?? "",
    secondaryColors: analysis?.secondaryColors.join(", ") ?? "",
    pattern: analysis?.pattern ?? "solid",
    style: analysis?.style ?? "casual",
    formalityLevel: analysis?.formalityLevel ?? 3,
    description: analysis?.description ?? "",
  };
}

export function ReviewForm({
  analysis,
  categories,
  subcategories,
  initialValue,
  onSave,
  onReanalyze,
  onCancel,
  saving,
}: {
  analysis: ClothingAnalysisInput | null;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  initialValue?: ReviewFormValue;
  onSave: (input: ReviewFormSaveInput) => void;
  onReanalyze?: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [value, setValue] = useState<ReviewFormValue>(
    initialValue ?? fromAnalysis(analysis, categories, subcategories)
  );

  const availableSubcategories = subcategories.filter((s) => s.categoryId === value.categoryId);
  const isFreshManualEntry = !analysis && !initialValue;
  const edited = analysis
    ? JSON.stringify(value) !== JSON.stringify(fromAnalysis(analysis, categories, subcategories))
    : true;

  function submit() {
    if (!value.categoryId || !value.subcategoryId) return;
    onSave({
      categoryId: value.categoryId,
      subcategoryId: value.subcategoryId,
      name: value.name || undefined,
      primaryColor: value.primaryColor,
      primaryColorHex: value.primaryColorHex || undefined,
      secondaryColors: value.secondaryColors.split(",").map((c) => c.trim()).filter(Boolean),
      pattern: value.pattern,
      style: value.style,
      formalityLevel: value.formalityLevel,
      description: value.description,
      userEdited: edited,
    });
  }

  const fieldClass =
    "rounded-md border border-border bg-surface px-2.5 py-1.5 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      {isFreshManualEntry && (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-secondary">
          AI analysis unavailable — enter the details below manually.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Category
          <select
            className={fieldClass}
            value={value.categoryId ?? ""}
            onChange={(e) =>
              setValue((v) => ({ ...v, categoryId: Number(e.target.value) || null, subcategoryId: null }))
            }
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Subcategory
          <select
            className={fieldClass}
            value={value.subcategoryId ?? ""}
            onChange={(e) => setValue((v) => ({ ...v, subcategoryId: Number(e.target.value) || null }))}
            disabled={!value.categoryId}
          >
            <option value="">Select subcategory</option>
            {availableSubcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.name.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Primary color
          <input
            className={fieldClass}
            value={value.primaryColor}
            onChange={(e) => setValue((v) => ({ ...v, primaryColor: e.target.value }))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Pattern
          <select
            className={fieldClass}
            value={value.pattern}
            onChange={(e) => setValue((v) => ({ ...v, pattern: e.target.value as ReviewFormValue["pattern"] }))}
          >
            {PATTERNS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Style
          <select
            className={fieldClass}
            value={value.style}
            onChange={(e) => setValue((v) => ({ ...v, style: e.target.value as ReviewFormValue["style"] }))}
          >
            {STYLES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Formality (1-5)
          <input
            type="number"
            min={1}
            max={5}
            className={fieldClass}
            value={value.formalityLevel}
            onChange={(e) => setValue((v) => ({ ...v, formalityLevel: Number(e.target.value) }))}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Description
        <textarea
          className={fieldClass}
          value={value.description}
          onChange={(e) => setValue((v) => ({ ...v, description: e.target.value }))}
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          onClick={submit}
          disabled={saving || !value.categoryId || !value.subcategoryId}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {onReanalyze && (
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm text-ink hover:bg-surface-muted"
            onClick={onReanalyze}
          >
            Re-analyze
          </button>
        )}
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-sm text-ink hover:bg-surface-muted"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
