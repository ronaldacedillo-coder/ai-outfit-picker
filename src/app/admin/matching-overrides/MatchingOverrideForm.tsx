"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMatchingOverride } from "./actions";
import { OCCASION_LABELS, STYLE_CONTEXT_LABELS, occasionEnum, styleContextEnum } from "@/lib/validation/occasion";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";

type SideMode = "item" | "category";

interface ItemOption {
  id: string;
  label: string;
}

const selectClass =
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

function SideFields({
  label,
  mode,
  setMode,
  items,
  categories,
  subcategories,
  itemId,
  setItemId,
  categoryId,
  setCategoryId,
  subcategoryId,
  setSubcategoryId,
}: {
  label: string;
  mode: SideMode;
  setMode: (m: SideMode) => void;
  items: ItemOption[];
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  itemId: string;
  setItemId: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  subcategoryId: string;
  setSubcategoryId: (v: string) => void;
}) {
  const filteredSubcategories = subcategories.filter((s) => String(s.categoryId) === categoryId);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setMode("item")}
            className={`rounded px-2 py-1 ${mode === "item" ? "bg-accent text-accent-foreground" : "text-ink-secondary"}`}
          >
            Specific item
          </button>
          <button
            type="button"
            onClick={() => setMode("category")}
            className={`rounded px-2 py-1 ${mode === "category" ? "bg-accent text-accent-foreground" : "text-ink-secondary"}`}
          >
            Category
          </button>
        </div>
      </div>

      {mode === "item" ? (
        <select className={selectClass} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">Select an item…</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex gap-2">
          <select
            className={selectClass}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setSubcategoryId("");
            }}
          >
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
            <option value="">Subcategory…</option>
            {filteredSubcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function MatchingOverrideForm({
  items,
  categories,
  subcategories,
}: {
  items: ItemOption[];
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
}) {
  const router = useRouter();
  const [baseMode, setBaseMode] = useState<SideMode>("item");
  const [baseItemId, setBaseItemId] = useState("");
  const [baseCategoryId, setBaseCategoryId] = useState("");
  const [baseSubcategoryId, setBaseSubcategoryId] = useState("");

  const [matchedMode, setMatchedMode] = useState<SideMode>("item");
  const [matchedItemId, setMatchedItemId] = useState("");
  const [matchedCategoryId, setMatchedCategoryId] = useState("");
  const [matchedSubcategoryId, setMatchedSubcategoryId] = useState("");

  const [reciprocal, setReciprocal] = useState(false);
  const [occasion, setOccasion] = useState("");
  const [styleContext, setStyleContext] = useState("");
  const [priority, setPriority] = useState(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await createMatchingOverride({
      baseItemId: baseMode === "item" && baseItemId ? baseItemId : undefined,
      baseCategoryId: baseMode === "category" && baseCategoryId ? Number(baseCategoryId) : undefined,
      baseSubcategoryId: baseMode === "category" && baseSubcategoryId ? Number(baseSubcategoryId) : undefined,
      matchedItemId: matchedMode === "item" && matchedItemId ? matchedItemId : undefined,
      matchedCategoryId: matchedMode === "category" && matchedCategoryId ? Number(matchedCategoryId) : undefined,
      matchedSubcategoryId: matchedMode === "category" && matchedSubcategoryId ? Number(matchedSubcategoryId) : undefined,
      reciprocal,
      occasion: occasionEnum.safeParse(occasion).success ? occasionEnum.parse(occasion) : undefined,
      styleContext: styleContextEnum.safeParse(styleContext).success ? styleContextEnum.parse(styleContext) : undefined,
      priority,
    });

    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    setBaseItemId("");
    setBaseCategoryId("");
    setBaseSubcategoryId("");
    setMatchedItemId("");
    setMatchedCategoryId("");
    setMatchedSubcategoryId("");
    setReciprocal(false);
    setOccasion("");
    setStyleContext("");
    setPriority(0);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-display text-lg font-medium text-ink">New matching rule</h2>
      {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <SideFields
        label="Base"
        mode={baseMode}
        setMode={setBaseMode}
        items={items}
        categories={categories}
        subcategories={subcategories}
        itemId={baseItemId}
        setItemId={setBaseItemId}
        categoryId={baseCategoryId}
        setCategoryId={setBaseCategoryId}
        subcategoryId={baseSubcategoryId}
        setSubcategoryId={setBaseSubcategoryId}
      />
      <SideFields
        label="Matched with"
        mode={matchedMode}
        setMode={setMatchedMode}
        items={items}
        categories={categories}
        subcategories={subcategories}
        itemId={matchedItemId}
        setItemId={setMatchedItemId}
        categoryId={matchedCategoryId}
        setCategoryId={setMatchedCategoryId}
        subcategoryId={matchedSubcategoryId}
        setSubcategoryId={setMatchedSubcategoryId}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5 text-ink">
          <input type="checkbox" checked={reciprocal} onChange={(e) => setReciprocal(e.target.checked)} />
          Applies in both directions
        </label>
        <select className={selectClass} value={occasion} onChange={(e) => setOccasion(e.target.value)}>
          <option value="">Any occasion</option>
          {occasionEnum.options.map((o) => (
            <option key={o} value={o}>
              {OCCASION_LABELS[o]}
            </option>
          ))}
        </select>
        <select className={selectClass} value={styleContext} onChange={(e) => setStyleContext(e.target.value)}>
          <option value="">Any style</option>
          {styleContextEnum.options.map((s) => (
            <option key={s} value={s}>
              {STYLE_CONTEXT_LABELS[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-ink">
          Priority
          <input
            type="number"
            className={`${selectClass} w-20`}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Saving…" : "Create rule"}
      </button>
    </form>
  );
}
