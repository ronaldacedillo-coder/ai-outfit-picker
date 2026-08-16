"use client";

import { useState } from "react";
import { updateClothingItem } from "@/app/dashboard/actions";
import type { ClothingItemRow } from "@/lib/wardrobe/types";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";
import { ReviewForm, type ReviewFormValue, type ReviewFormSaveInput } from "./ReviewForm";
import { Modal } from "@/components/ui/Modal";

export function EditItemDialog({
  item,
  categories,
  subcategories,
  onClose,
}: {
  item: ClothingItemRow;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialValue: ReviewFormValue = {
    categoryId: item.categoryId,
    subcategoryId: item.subcategoryId,
    name: item.name ?? "",
    primaryColor: item.primaryColor,
    primaryColorHex: item.primaryColorHex ?? "",
    secondaryColors: item.secondaryColors.join(", "),
    pattern: item.pattern as ReviewFormValue["pattern"],
    style: item.style as ReviewFormValue["style"],
    formalityLevel: item.formalityLevel,
    description: item.description,
  };

  async function handleSave(input: ReviewFormSaveInput) {
    setSaving(true);
    const result = await updateClothingItem(item.id, { ...input, imagePath: item.imagePath, aiAnalysis: undefined });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 font-display text-xl font-medium text-ink">Edit item</h2>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <ReviewForm
        analysis={null}
        categories={categories}
        subcategories={subcategories}
        initialValue={initialValue}
        onSave={handleSave}
        onCancel={onClose}
        saving={saving}
      />
    </Modal>
  );
}
