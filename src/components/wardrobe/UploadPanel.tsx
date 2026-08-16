"use client";

import { useState, type ChangeEvent } from "react";
import { UploadItemCard } from "./UploadItemCard";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";

export function UploadPanel({
  categories,
  subcategories,
}: {
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
}) {
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);

  function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...selected.map((file) => ({ id: crypto.randomUUID(), file }))]);
    e.target.value = "";
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <section className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-ink-secondary transition-colors hover:bg-surface-muted">
        <span>Click to upload one or more clothing photos</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleSelect}
        />
      </label>

      <div className="flex flex-col gap-4">
        {files.map(({ id, file }) => (
          <UploadItemCard
            key={id}
            file={file}
            categories={categories}
            subcategories={subcategories}
            onSaved={() => removeFile(id)}
            onRemove={() => removeFile(id)}
          />
        ))}
      </div>
    </section>
  );
}
