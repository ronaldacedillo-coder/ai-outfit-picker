"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import type { ClothingItemRow } from "@/lib/wardrobe/types";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";
import { ClothingCard } from "./ClothingCard";
import { EditItemDialog } from "./EditItemDialog";

export function WardrobeGrid({
  items,
  categories,
  subcategories,
  readOnly = false,
}: {
  items: ClothingItemRow[];
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  readOnly?: boolean;
}) {
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [styleFilter, setStyleFilter] = useState("all");
  const [formalityFilter, setFormalityFilter] = useState<number | "all">("all");
  const [colorFilter, setColorFilter] = useState("");
  const [editing, setEditing] = useState<ClothingItemRow | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.categoryId !== categoryFilter) return false;
      if (styleFilter !== "all" && item.style !== styleFilter) return false;
      if (formalityFilter !== "all" && item.formalityLevel !== formalityFilter) return false;
      if (colorFilter && !item.primaryColor.toLowerCase().includes(colorFilter.toLowerCase())) return false;
      return true;
    });
  }, [items, categoryFilter, styleFilter, formalityFilter, colorFilter]);

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface-muted px-6 py-10 text-center text-sm text-ink-secondary">
        {readOnly ? "The catalog is empty right now — check back soon." : "Your wardrobe is empty — upload your first item above."}
      </p>
    );
  }

  const selectClass =
    "rounded-md border border-border bg-surface px-2.5 py-1.5 text-ink transition-shadow duration-150 ease-out focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          className={selectClass}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className={selectClass} value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)}>
          <option value="all">All styles</option>
          <option value="business_formal">business formal</option>
          <option value="business_casual">business casual</option>
          <option value="smart_casual">smart casual</option>
          <option value="casual">casual</option>
        </select>
        <select
          className={selectClass}
          value={formalityFilter}
          onChange={(e) => setFormalityFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">Any formality</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <input
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-ink placeholder:text-ink-muted transition-shadow duration-150 ease-out focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          placeholder="Filter by color"
          value={colorFilter}
          onChange={(e) => setColorFilter(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        <AnimatePresence initial={false}>
          {filtered.map((item, index) => (
            <ClothingCard
              key={item.id}
              item={item}
              index={index}
              readOnly={readOnly}
              onEdit={readOnly ? undefined : () => setEditing(item)}
            />
          ))}
        </AnimatePresence>
      </div>

      {!readOnly && editing && (
        <EditItemDialog
          item={editing}
          categories={categories}
          subcategories={subcategories}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
